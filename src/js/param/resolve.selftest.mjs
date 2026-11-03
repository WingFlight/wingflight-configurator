/**
 * Offline checks for manifest resolution.
 *
 * The check that matters most is the first: the build ID this computes must
 * equal the one the Python generator put in the manifest. If the two
 * canonicalisations ever drift, every manifest fails to verify and the
 * configurator refuses every board -- so this is worth pinning against a real
 * generated file rather than a fixture.
 *
 *   node src/js/param/resolve.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { computeBuildId, verifyManifest, resolveManifest, ResolveError, explainMissingManifest } from "./resolve.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

async function throwsAsync(what, fn) {
    checks++;
    try {
        await fn();
        failures++;
        console.error(`FAIL  ${what} -- expected rejection, got none`);
    } catch (error) {
        if (!(error instanceof ResolveError)) {
            failures++;
            console.error(`FAIL  ${what} -- threw ${error.constructor.name}, wanted ResolveError`);
        }
    }
}

const path = process.argv[2];
if (!path) {
    console.error("usage: node resolve.selftest.mjs <manifest.json>");
    process.exit(2);
}

const raw = JSON.parse(readFileSync(path, "utf8"));
const declared = raw.build.id;

// --- the one that matters --------------------------------------------------

const computed = await computeBuildId(raw);
check("JS build ID matches the generator's", computed === declared, `${computed} vs ${declared}`);
console.log(`build id: generator=${declared} recomputed=${computed}`);

// Build metadata must not affect it, or every rebuild churns the cache key.
const restamped = JSON.parse(JSON.stringify(raw));
restamped.build = { target: "OTHER", date: "Jan 01 1970", time: "00:00:00", git: "deadbeef", id: "x" };
check("build metadata does not change the ID", (await computeBuildId(restamped)) === computed);

// A layout change must change it.
const moved = JSON.parse(JSON.stringify(raw));
moved.pgs[0].fields[0].off += 1;
check("a moved field changes the ID", (await computeBuildId(moved)) !== computed);

// --- verification ----------------------------------------------------------

const registry = raw.pgs.map((pg) => ({
    pgn: pg.pgn,
    version: pg.version,
    size: pg.size,
    length: pg.length,
}));

const good = await verifyManifest(raw, { buildId: declared, registry });
check("a matching manifest verifies", good.settings.size === raw.settings.length);

await throwsAsync("a manifest for another build is refused", () =>
    verifyManifest(raw, { buildId: "0000000000000000", registry }),
);

const wrongRegistry = registry.map((g, i) => (i === 5 ? { ...g, size: g.size + 2 } : g));
await throwsAsync("a registry mismatch is refused", () =>
    verifyManifest(raw, { buildId: declared, registry: wrongRegistry }),
);

const tampered = JSON.parse(JSON.stringify(raw));
tampered.pgs[2].size += 4; // contents no longer hash to the claimed id
await throwsAsync("a tampered manifest is refused by its own claimed id", () =>
    verifyManifest(tampered, { buildId: null, registry: null }),
);

// --- resolution order ------------------------------------------------------

const order = [];
function source(name, result) {
    return {
        name,
        fetch: async () => {
            order.push(name);
            if (result instanceof Error) {
                throw result;
            }
            return result;
        },
    };
}

order.length = 0;
const resolved = await resolveManifest({
    buildId: declared,
    registry,
    sources: [
        source("cache", null), // miss
        source("network", new Error("offline")), // error
        source("board", raw), // hit
        source("release", raw), // must not be reached
    ],
});
check("resolution stops at the first source that verifies", resolved.source === "board", resolved.source);
check("resolution tries sources in order", order.join(",") === "cache,network,board", order.join(","));
check("a miss is recorded rather than thrown", resolved.attempts.some((a) => a.includes("cache")));
check("an erroring source is skipped, not fatal", resolved.attempts.some((a) => a.includes("offline")));

// A source offering the wrong manifest must be rejected, not used.
order.length = 0;
const stale = JSON.parse(JSON.stringify(raw));
stale.pgs[1].version += 1;
const afterStale = await resolveManifest({
    buildId: declared,
    registry,
    sources: [source("stale-cache", stale), source("board", raw)],
});
check("a stale manifest is rejected and the next source used", afterStale.source === "board");

await throwsAsync("resolution fails when nothing verifies", () =>
    resolveManifest({ buildId: declared, registry, sources: [source("nothing", null)] }),
);

// --- the failure message ---------------------------------------------------

const unbuilt = explainMissingManifest({ buildId: null });
check("an unbound build is explained differently from a missing one",
    unbuilt.includes("make manifest") && !unbuilt.includes("No manifest could be found"));
const missing = explainMissingManifest({ buildId: "abcdef0123456789" });
check("a missing manifest says flashing still works", missing.includes("flashing still works"));

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
