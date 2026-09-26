/**
 * Answers routed MSP requests from the virtual layer, as a reply would arrive:
 * through the MSP object's listeners, so MSPHelper decodes it into FC state
 * and fires the caller's callback exactly as for the firmware's own reply.
 * See msp_routing.js for when it is installed.
 */

export class ReplyRouter {
    /**
     * @param virtual a VirtualMsp
     * @param codes   the opcodes to answer
     * @param msp     the MSP object: its listeners get the reply, its
     *                send_message the fallback
     */
    constructor(virtual, codes, msp) {
        this.virtual = virtual;
        this.codes = new Set(codes);
        this.msp = msp;
    }

    /** Only plain requests: a request carrying arguments is not a codec's reply. */
    routes(code, data) {
        return this.codes.has(code) && (!data || data.length === 0);
    }

    /** Answer as the firmware would, through the same listeners a reply takes. */
    answer(code, data, callback, callbackOnError) {
        this.virtual
            .read(code)
            .then((bytes) => {
                const handler = {
                    code,
                    dataView: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                    crcError: false,
                    unsupported: 0,
                    callbacks: [{ code, callback: callback ?? false, timer: 0, callbackOnError }],
                };
                for (const listener of this.msp.listeners) {
                    listener(handler);
                }
            })
            .catch((error) => {
                console.warn(`virtual reply for opcode ${code} failed, using the firmware's: ${error.message}`);
                this.codes.delete(code);
                this.msp.send_message(code, data, false, callback, callbackOnError);
            });
    }
}
