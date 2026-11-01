/**
 * Offline checks for which requests the reply router (param/reply_router.js)
 * answers from the virtual layer, and what it does when that fails.
 *
 * A verifying router answers only the replies verified at connect and, with
 * setters enabled, a setter only once it has been verified; anything it
 * cannot build goes back to the firmware. An authoritative router (a build
 * without a config catalogue) answers every request its codecs describe from
 * the first one, and a failure is a refusal: there is no firmware opcode to
 * fall back to. The virtual layer and the MSP object are stubs.
 *
 *   node src/js/param/reply_router.selftest.mjs
 */

import { ReplyRouter } from "./reply_router.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

const REPLY = 100; // a plain reply codec
const INDEXED = 101; // a reply indexed by one request byte
const SETTER = 200; // a setter codec
const UNKNOWN = 300; // no codec

const CODECS = {
    [REPLY]: { dir: "out" },
    [INDEXED]: { dir: "out", index: { w: 1 } },
    [SETTER]: { dir: "in" },
};

function stubs({ readFails = false } = {}) {
    const sent = [];
    const delivered = [];
    const virtual = {
        codec: (code) => CODECS[code] ?? null,
        read: (code) => (readFails ? Promise.reject(new Error("PARAM_READ refused")) : Promise.resolve(new Uint8Array([code & 0xff]))),
        write: () => Promise.resolve(),
    };
    const msp = {
        listeners: [(handler) => delivered.push({ code: handler.code, unsupported: handler.unsupported, length: handler.dataView.byteLength })],
        send_message: (code) => sent.push(code),
    };
    return { virtual, msp, sent, delivered };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Verifying router: only verified replies; setters not without the option.
{
    const { virtual, msp } = stubs();
    const router = new ReplyRouter(virtual, [REPLY], msp);
    check("verifying: a verified reply is routed", router.routes(REPLY, []));
    check("verifying: an unverified reply is not routed", !router.routes(INDEXED, [1]));
    check("verifying: a setter is not routed without the setters option", !router.routes(SETTER, [1]));
    check("verifying: an opcode without a codec is not routed", !router.routes(UNKNOWN, []));
}

// Authoritative router: every codec from the first request, the index rule kept.
{
    const { virtual, msp } = stubs();
    const router = new ReplyRouter(virtual, [], msp, null, { authoritative: true });
    check("authoritative: a reply is routed without verification", router.routes(REPLY, []));
    check("authoritative: an indexed reply is routed for exactly its index", router.routes(INDEXED, [3]));
    check("authoritative: an indexed reply with other arguments is not", !router.routes(INDEXED, [1, 2]));
    check("authoritative: a setter is routed at once", router.routes(SETTER, [1]));
    check("authoritative: an opcode without a codec is not routed", !router.routes(UNKNOWN, []));
    const callback = () => {};
    check("authoritative: no setter verification wraps the callback", router.observe(SETTER, [1], callback) === callback);
}

// Failures: the verifying router falls back to the firmware, the authoritative one refuses.
{
    const { virtual, msp, sent, delivered } = stubs({ readFails: true });
    new ReplyRouter(virtual, [REPLY], msp).answer(REPLY, [], null, false);
    await settle();
    check("verifying: a failed reply goes to the firmware", sent.length === 1 && sent[0] === REPLY && delivered.length === 0);
}
{
    const { virtual, msp, sent, delivered } = stubs({ readFails: true });
    new ReplyRouter(virtual, [], msp, null, { authoritative: true }).answer(REPLY, [], null, false);
    await settle();
    check("authoritative: a failed reply is not sent to the firmware", sent.length === 0);
    check("authoritative: a failed reply is answered as a refusal", delivered.length === 1 && delivered[0].unsupported === 1);
}
{
    const { virtual, msp, delivered } = stubs();
    new ReplyRouter(virtual, [], msp, null, { authoritative: true }).answer(REPLY, [], null, false);
    await settle();
    check("authoritative: a reply is answered from the virtual layer", delivered.length === 1 && delivered[0].unsupported === 0 && delivered[0].length === 1);
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
