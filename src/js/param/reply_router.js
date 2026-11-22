/**
 * Answers routed MSP requests from the virtual layer, as a reply would arrive:
 * through the MSP object's listeners, so MSPHelper decodes it into FC state
 * and fires the caller's callback exactly as for the firmware's own reply.
 * See msp_routing.js for when it is installed.
 *
 * Replies are routed for the opcodes verified at connect. Setters, when
 * enabled, are verified on first use: that request goes to the firmware,
 * and behind it checkSetterAfterFirmware() confirms the codec would have
 * stored the same bytes. Only then are later requests for it written through
 * addressed access.
 */

import { VirtualMspError } from "./virtual_msp.js";
import { checkSetterAfterFirmware } from "./verify_msp.js";

export class ReplyRouter {
    /**
     * @param virtual a VirtualMsp
     * @param codes   the reply opcodes to answer
     * @param msp     the MSP object: its listeners get the reply, its
     *                send_message the fallback
     * @param setters null, or { io, log } to route setters verified on first use
     */
    constructor(virtual, codes, msp, setters = null) {
        this.virtual = virtual;
        this.codes = new Set(codes);
        this.msp = msp;
        this.setters = setters;
        this.setterState = new Map(); // opcode -> "pending" | true | false
    }

    /**
     * Only requests the codec describes: a plain one, or for a
     * request-indexed reply exactly its index; a setter once verified.
     */
    routes(code, data) {
        const codec = this.virtual.codec(code);
        if (codec?.dir === "in") {
            return this.setters !== null && this.setterState.get(code) === true;
        }
        if (!this.codes.has(code)) return false;
        const length = data ? data.length : 0;
        return codec?.index ? length === (codec.len ?? codec.index.w) : length === 0;
    }

    /**
     * For a request going to the firmware: the callback to give it. For a
     * setter not yet verified, one that verifies it once the firmware has
     * taken the request; otherwise `callback` itself.
     */
    observe(code, data, callback) {
        if (this.setters === null || this.virtual.codec(code)?.dir !== "in" || this.setterState.has(code)) {
            return callback;
        }
        this.setterState.set(code, "pending");
        const payload = Uint8Array.from(data ?? []);
        return (reply) => {
            if (callback) callback(reply);
            if (!reply || reply.unsupported || reply.crcError) {
                this.setterState.delete(code); // nothing stored to compare: try the next one
                return;
            }
            checkSetterAfterFirmware(this.virtual, this.setters.io, code, payload)
                .then((result) => {
                    if (result.ok === null) {
                        this.setterState.delete(code);
                        return;
                    }
                    this.setterState.set(code, result.ok);
                    this.setters.log(
                        result.ok
                            ? `Addressed config writes: opcode ${code} verified, now written through addressed access`
                            : `Addressed config writes: opcode ${code} stays on the firmware's setter: ${result.reason}`,
                    );
                })
                .catch((error) => {
                    this.setterState.set(code, false);
                    console.warn(`verifying the setter for opcode ${code} failed: ${error.message}`);
                });
        };
    }

    /** Answer as the firmware would, through the same listeners a reply takes. */
    answer(code, data, callback, callbackOnError) {
        const deliver = (bytes, unsupported) => {
            const handler = {
                code,
                dataView: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                crcError: false,
                unsupported,
                callbacks: [{ code, callback: callback ?? false, timer: 0, callbackOnError }],
            };
            for (const listener of this.msp.listeners) {
                listener(handler);
            }
        };
        const setter = this.virtual.codec(code)?.dir === "in";
        const done = setter ? this.virtual.write(code, data || []).then(() => new Uint8Array(0)) : this.virtual.read(code, data || []);
        done.then((bytes) => deliver(bytes, 0)).catch((error) => {
            if (setter && error instanceof VirtualMspError) {
                // the request is one the firmware refuses: answer as it does
                deliver(new Uint8Array(0), 1);
                return;
            }
            console.warn(`virtual ${setter ? "setter" : "reply"} for opcode ${code} failed, using the firmware's: ${error.message}`);
            if (setter) this.setterState.set(code, false);
            else this.codes.delete(code);
            this.msp.send_message(code, data, false, callback, callbackOnError);
        });
    }
}
