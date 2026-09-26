/**
 * Route verified config replies through the virtual MSP layer (experimental).
 *
 * With the "addressedConfigReplies" option on, connecting opens a param
 * session and runs verify_msp's reply check against *this* board: every
 * config reply the virtual layer can build is compared with the firmware's
 * own. Only the ones that match byte for byte are then answered by the
 * virtual layer; everything else, and every setter, keeps using the
 * firmware's opcodes. So a tab can only ever see a reply the board itself
 * just gave -- the point is to exercise the layer in real use before step 5
 * takes the legacy opcodes away.
 *
 * Should a routed reply fail later (the board refuses a PARAM_READ, say),
 * that opcode drops back to the legacy path for the rest of the session.
 */

import * as config from "@/js/config.js";
import { MSP } from "@/js/msp.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { openParamSession } from "./session.js";
import { VirtualMsp } from "./virtual_msp.js";
import { verifyReplies } from "./verify_msp.js";
import { ReplyRouter } from "./reply_router.js";

export const OPTION = "addressedConfigReplies";

export async function startAddressedReplies(log = console.log) {
    stopAddressedReplies();
    if (!config.get(OPTION)) {
        return;
    }
    let session;
    try {
        session = await openParamSession({ askForFile: false });
    } catch (error) {
        log(`Addressed config replies: off for this board (${error.message})`);
        return;
    }
    const virtual = new VirtualMsp(session.manifest, session.io);
    if (!Object.keys(virtual.codecs).length) {
        log("Addressed config replies: this firmware's manifest carries no MSP codecs");
        return;
    }
    const names = Object.fromEntries(Object.entries(MSPCodes).map(([name, code]) => [code, name]));
    const result = await verifyReplies(virtual, session.io.rawRequest, names);
    MSP.virtualLayer = new ReplyRouter(virtual, result.matched, MSP);
    log(
        `Addressed config replies: serving ${result.ok} verified replies from addressed access` +
            (result.bad ? `; ${result.bad} did not match this board and stay on the firmware's opcodes` : ""),
    );
    for (const line of result.lines.filter((l) => l.startsWith("FAIL"))) {
        console.warn(line);
    }
}

export function stopAddressedReplies() {
    MSP.virtualLayer = null;
}
