import assert from 'node:assert/strict';
import test from 'node:test';
import {
    primaryOf, servoGroups, followChoices, followersWithRules, copyPrimaryTravel,
    BALANCE_POINTS, balanceCurve, balanceSetting, followerOutput, nudgeBalance,
} from '../../src/js/servoGroups.js';

const servo = (overrides = {}) => ({ mid: 1500, min: -600, max: 600, rneg: 500, rpos: 500, speed: 0, flags: 0, ...overrides });
const point = (key) => BALANCE_POINTS.find((p) => p.key === key);

test('a follower is driven by a primary that drives itself', () => {
    // S2 follows S1, S4 follows S3, S5 follows itself, S6 follows S2 (a follower)
    const follow = [0, 1, 0, 3, 5, 2];
    assert.equal(primaryOf(follow, 1), 0);
    assert.equal(primaryOf(follow, 3), 2);
    assert.equal(primaryOf(follow, 4), 4);
    assert.equal(primaryOf(follow, 5), 5);
    // A primary past the servos in use
    assert.equal(primaryOf([0, 9], 1, 2), 1);
    assert.deepEqual(servoGroups(follow), [
        { primary: 0, followers: [1] },
        { primary: 2, followers: [3] },
    ]);
    assert.deepEqual(servoGroups(null, 4), []);
});

test('a servo can follow any other that drives itself, unless it is followed', () => {
    const follow = [0, 1, 0, 0];
    assert.deepEqual(followChoices(follow, 2, 4), [0, 3]);
    // S1 has a follower, so it can't follow anything
    assert.deepEqual(followChoices(follow, 0, 4), []);
    // S2 can't follow itself or its own follower-ness
    assert.deepEqual(followChoices(follow, 1, 4), [0, 2, 3]);
});

test('rules on a follower are found, since the FC ignores them', () => {
    const rules = [
        { oper: 1, src: 1, dst: 1 },
        { oper: 1, src: 1, dst: 2 },
        { oper: 0, src: 0, dst: 3 },
    ];
    assert.deepEqual(followersWithRules([0, 1, 1], rules, 3), [1]);
});

test('a follower starts from its primary travel, swapped when mounted the other way', () => {
    const primary = servo({ rpos: 450, rneg: 520, max: 400, min: -500 });
    const same = servo({ mid: 1510 });
    copyPrimaryTravel(primary, same);
    assert.deepEqual([same.rpos, same.rneg, same.max, same.min, same.mid], [450, 520, 400, -500, 1510]);

    const mirrored = servo({ flags: 1 });
    copyPrimaryTravel(primary, mirrored);
    assert.deepEqual([mirrored.rpos, mirrored.rneg, mirrored.max, mirrored.min], [520, 450, 500, -400]);
});

test('each balance point moves its own setting', () => {
    const config = servo();
    assert.equal(balanceSetting(point('center'), config), 'mid');
    assert.equal(balanceSetting(point('endPos'), config), 'rpos');
    assert.equal(balanceSetting(point('endNeg'), config), 'rneg');
    assert.equal(balanceSetting(point('halfPos'), config), 'curve');
    // Reversed, full positive command moves it to the negative side
    assert.equal(balanceSetting(point('endPos'), servo({ flags: 1 })), 'rneg');
});

test('a nudge moves the output by that much at its point', () => {
    for (const flags of [0, 1]) {
        const config = servo({ flags, rpos: 400, rneg: 600 });
        const curve = balanceCurve(null);
        for (const p of BALANCE_POINTS) {
            const before = followerOutput(config, curve, p.command);
            nudgeBalance(p, config, curve, 10);
            const after = followerOutput(config, curve, p.command);
            // Rounded to whole curve steps on the half points
            assert.ok(Math.abs(after - before - 10) <= 1, `${p.key} flags ${flags}: ${after - before}`);
        }
    }
});

test('the later points leave the earlier ones where they were', () => {
    const config = servo();
    const curve = balanceCurve(null);
    nudgeBalance(point('center'), config, curve, 12);
    nudgeBalance(point('endPos'), config, curve, -20);
    const center = followerOutput(config, curve, 0);
    const end = followerOutput(config, curve, 1000);
    nudgeBalance(point('halfPos'), config, curve, 5);
    nudgeBalance(point('halfNeg'), config, curve, -5);
    assert.equal(followerOutput(config, curve, 0), center);
    assert.equal(followerOutput(config, curve, 1000), end);
});

test('a nudge at a limit changes nothing', () => {
    const config = servo({ rpos: 1000 });
    assert.equal(nudgeBalance(point('endPos'), config, balanceCurve(null), 5), null);
    assert.equal(config.rpos, 1000);

    const curve = balanceCurve(null);
    curve.points[3].y = 100;
    assert.equal(nudgeBalance(point('halfPos'), servo(), curve, 5), null);
});

test('a balance curve in the tool shape is kept, any other starts flat', () => {
    const kept = balanceCurve(null);
    kept.points[1].y = -30;
    assert.equal(balanceCurve(kept).points[1].y, -30);
    const other = { count: 2, points: [{ x: -1000, y: 20 }, { x: 1000, y: 20 }] };
    assert.deepEqual(balanceCurve(other).points.slice(0, 5).map((p) => p.y), [0, 0, 0, 0, 0]);
});
