import { record, Replayer } from 'rrweb';
import { RemoteSupport, VIEW_DATA, VIEW_REQUEST } from '@/js/protocols/RemoteSupport.js';

/*
    Screen mirroring for remote support: the person getting help (pilot) sees
    what the supporter does in their configurator.

    The supporter's configurator records its own DOM with rrweb (a snapshot
    plus every change, input, scroll and pointer move) and sends the events
    to the pilot's configurator through the remote support tool, end to end
    encrypted like the rest of the session. The pilot's configurator replays
    them in a read-only window. Nothing the pilot does there can reach the
    supporter or the flight controller.

    The pilot starts and stops the stream (VIEW_REQUEST), so nothing is
    recorded or sent unless someone is watching. The supporter's dialog shows
    when that is the case. Password fields are masked by rrweb.

    Wire format (see PROTOCOL.md): each message is `type kind payload`.
    VIEW_DATA carries one JSON-encoded rrweb event, split into fragments of
    FRAGMENT_SIZE bytes when larger (kind WHOLE, or FIRST/MIDDLE/LAST).
    VIEW_REQUEST carries one of the REQUEST codes.
*/

const FRAGMENT_SIZE = 16000;
// The tool's socket buffer is small; sending the fragments of a large
// snapshot back to back would overflow it.
const FRAGMENT_INTERVAL = 2;
// If the link can't keep up, start over with a fresh snapshot instead of
// falling further and further behind.
const MAX_QUEUED_FRAGMENTS = 600;
const REQUEST_RETRY_INTERVAL = 2000;

const KIND = { WHOLE: 0, FIRST: 1, MIDDLE: 2, LAST: 3 };
const REQUEST = { START: 1, STOP: 2 };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** What the remote support dialog shows. */
export const remote = $state({
    toolRunning: false,
    relayConnected: false,
    role: null,
    code: '',
    peerConnected: false,
    device: null,
    message: null,
    error: false,
    // Pilot: the viewer window is open and a frame has arrived.
    watching: false,
    hasFrame: false,
    // Supporter: the pilot is watching this configurator.
    beingWatched: false,
});

function sync() {
    const { session } = RemoteSupport;
    remote.toolRunning = RemoteSupport.toolRunning;
    remote.relayConnected = RemoteSupport.relayConnected;
    remote.role = session.role ?? null;
    remote.code = session.code ?? '';
    remote.peerConnected = RemoteSupport.peerConnected;
    remote.device = session.device ?? null;
    remote.message = session.message ?? null;
    remote.error = Boolean(session.error);

    if (remote.role !== 'join' || !remote.peerConnected) {
        stopRecording();
    }
    if (!remote.peerConnected) {
        remote.hasFrame = false;
    }
}

export function startSession(code) {
    RemoteSupport.joinSession(code);
}

export function startSharing() {
    RemoteSupport.shareSession();
}

export function stopSession() {
    RemoteSupport.stopSession();
}

// ---- supporter: record and send -------------------------------------------

let stopRecord = null;
const outbox = [];
let outboxTimer = null;

function pump() {
    if (outboxTimer !== null || !outbox.length) {
        return;
    }
    outboxTimer = setTimeout(() => {
        outboxTimer = null;
        const message = outbox.shift();
        if (message) {
            RemoteSupport.sendView(VIEW_DATA, message);
        }
        pump();
    }, FRAGMENT_INTERVAL);
}

function queue(kind, chunk) {
    const message = new Uint8Array(1 + chunk.length);
    message[0] = kind;
    message.set(chunk, 1);
    outbox.push(message);
}

function sendEvent(event) {
    const bytes = textEncoder.encode(JSON.stringify(event));
    if (bytes.length <= FRAGMENT_SIZE) {
        queue(KIND.WHOLE, bytes);
    } else {
        for (let offset = 0; offset < bytes.length; offset += FRAGMENT_SIZE) {
            const last = offset + FRAGMENT_SIZE >= bytes.length;
            const kind = offset === 0 ? KIND.FIRST : last ? KIND.LAST : KIND.MIDDLE;
            queue(kind, bytes.subarray(offset, offset + FRAGMENT_SIZE));
        }
    }
    if (outbox.length > MAX_QUEUED_FRAGMENTS) {
        outbox.length = 0;
        record.takeFullSnapshot(true);
    }
    pump();
}

function startRecording() {
    if (stopRecord) {
        // The pilot (re)started watching: give them a fresh picture.
        record.takeFullSnapshot(true);
    } else {
        stopRecord = record({
            emit: sendEvent,
            sampling: { mousemove: 50, scroll: 100, input: 'last' },
            // Replaying canvases needs a script-enabled, same-origin iframe,
            // which would let a supporter run code in the pilot's
            // configurator (and through NW.js, on their computer). So the
            // 3D model and graphs stay blank in the viewer.
            recordCanvas: false,
            maskInputOptions: { password: true },
        });
    }
    remote.beingWatched = true;
}

function stopRecording() {
    stopRecord?.();
    stopRecord = null;
    outbox.length = 0;
    remote.beingWatched = false;
}

function handleRequest(code) {
    if (remote.role !== 'join' || !remote.peerConnected) {
        return;
    }
    if (code === REQUEST.START) {
        startRecording();
    } else if (code === REQUEST.STOP) {
        stopRecording();
    }
}

// ---- pilot: receive and replay --------------------------------------------

let replayer = null;
let viewerContainer = null;
let viewerSize = null;
let retryTimer = null;
let resizeObserver = null;
let partial = null;

function sendRequest(code) {
    RemoteSupport.sendView(VIEW_REQUEST, Uint8Array.of(code));
}

function fit() {
    if (!replayer || !viewerSize || !viewerContainer) {
        return;
    }
    const scale = Math.min(
        viewerContainer.clientWidth / viewerSize.width,
        viewerContainer.clientHeight / viewerSize.height,
    );
    replayer.wrapper.style.transformOrigin = 'top left';
    replayer.wrapper.style.transform = `scale(${scale})`;
}

/** Opens the read-only replay inside `container` and asks for the stream. */
export function startWatching(container) {
    stopWatching();
    viewerContainer = container;
    replayer = new Replayer([], {
        root: container,
        liveMode: true,
        mouseTail: false,
        showWarning: false,
        // Keep rrweb's default sandbox (no scripts): see startRecording().
        UNSAFE_replayCanvas: false,
    });
    replayer.on('resize', (size) => {
        viewerSize = size;
        fit();
    });
    replayer.startLive();
    resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(container);

    remote.watching = true;
    remote.hasFrame = false;
    sendRequest(REQUEST.START);
    retryTimer = setInterval(() => {
        // The supporter may not be ready yet, or a datagram was lost.
        if (!remote.hasFrame && remote.peerConnected) {
            sendRequest(REQUEST.START);
        }
    }, REQUEST_RETRY_INTERVAL);
}

export function stopWatching() {
    if (remote.watching) {
        sendRequest(REQUEST.STOP);
    }
    clearInterval(retryTimer);
    retryTimer = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    replayer?.destroy();
    replayer = null;
    viewerContainer?.replaceChildren();
    viewerContainer = null;
    viewerSize = null;
    partial = null;
    remote.watching = false;
    remote.hasFrame = false;
}

function addEvent(event) {
    if (!replayer) {
        return;
    }
    // Live mode schedules events by timestamp on this computer's clock, so a
    // supporter whose clock is ahead would appear frozen. Play them as they
    // arrive instead.
    event.timestamp = Date.now();
    replayer.addEvent(event);
    if (event.type === 2) {
        remote.hasFrame = true;
    }
}

// Images and fonts in the events point at the supporter's app origin. A
// release build's chrome-extension:// origin differs per install, so point
// them at ours.
let remoteOrigin = null;

function localizeUrls(text) {
    if (text.startsWith('{"type":4,')) {
        // Meta event: tells us where the supporter's app is served from.
        try {
            remoteOrigin = new URL(JSON.parse(text).data.href).origin;
        } catch {
            // keep the previous origin
        }
    }
    if (!remoteOrigin || remoteOrigin === location.origin) {
        return text;
    }
    return text.split(remoteOrigin).join(location.origin);
}

function handleData(body) {
    if (!replayer || body.length < 1) {
        return;
    }
    const chunk = body.subarray(1);
    let json;
    switch (body[0]) {
        case KIND.WHOLE:
            json = chunk;
            break;
        case KIND.FIRST:
            partial = [chunk.slice()];
            return;
        case KIND.MIDDLE:
            partial?.push(chunk.slice());
            return;
        case KIND.LAST: {
            if (!partial) {
                return;
            }
            partial.push(chunk.slice());
            const joined = new Uint8Array(partial.reduce((sum, part) => sum + part.length, 0));
            let offset = 0;
            for (const part of partial) {
                joined.set(part, offset);
                offset += part.length;
            }
            partial = null;
            json = joined;
            break;
        }
        default:
            return;
    }
    try {
        addEvent(JSON.parse(localizeUrls(textDecoder.decode(json))));
    } catch (err) {
        console.warn('Remote view: bad event', err);
        // We may have missed part of the picture; get a fresh one.
        sendRequest(REQUEST.START);
    }
}

function handleView(type, body) {
    if (type === VIEW_REQUEST) {
        handleRequest(body[0]);
    } else if (type === VIEW_DATA) {
        handleData(body);
    }
}

RemoteSupport.onChange = sync;
RemoteSupport.onView = handleView;
