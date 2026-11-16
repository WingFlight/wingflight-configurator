import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SERVO_ROLE, SERVO_ROLES, packRole, roleOf, roleNumberOf, roleKey,
    servosWithRole, renumberRoles, setRole, applyLayoutRoles, roleText,
} from '../../src/js/servoRoles.js';

const R = SERVO_ROLE;
const t = (key) => key.replace('servoRole_', '');

test('the role byte matches the firmware', () => {
    // servoRoleValue(SERVO_ROLE_AILERON_LEFT, 2) in pg/servo_role.h
    assert.equal(packRole(R.AILERON_LEFT, 2), (2 << 3) | 1);
    assert.equal(roleOf(packRole(R.CHOKE, 3)), 28);
    assert.equal(roleNumberOf(packRole(R.CHOKE, 3)), 3);
    assert.equal(packRole(R.OTHER, 8), 255);
    assert.equal(roleNumberOf(packRole(R.RUDDER, 12)), 8);
    // Every role listed once, none of them in the reserved slots
    const values = SERVO_ROLES.map((r) => r.value);
    assert.equal(new Set(values).size, values.length);
    assert.ok(!values.includes(29) && !values.includes(30));
    assert.equal(roleKey(30), 'servoRole_unknown');
});

test('servos on the same role are numbered in servo order', () => {
    let roles = [0, 0, 0, 0, 0];
    roles = setRole(roles, 3, R.AILERON_LEFT);
    roles = setRole(roles, 0, R.AILERON_LEFT);
    roles = setRole(roles, 1, R.RUDDER);
    assert.deepEqual(roles.map(roleOf), [R.AILERON_LEFT, R.RUDDER, 0, R.AILERON_LEFT, 0]);
    assert.deepEqual(roles.map(roleNumberOf), [1, 1, 1, 2, 1]);
    assert.deepEqual(servosWithRole(roles, 3), [0, 3]);
    assert.deepEqual(servosWithRole(roles, 2), []);
    assert.equal(roleText(roles, 3, t), 'aileronLeft 2');
    assert.equal(roleText(roles, 1, t), 'rudder');
    assert.equal(roleText(roles, 2, t), '');
    // Taking one off renumbers the rest
    roles = setRole(roles, 0, R.NONE);
    assert.equal(roleText(roles, 3, t), 'aileronLeft');
    assert.equal(roleNumberOf(roles[3]), 1);
});

test('a model setup replaces surface roles and keeps the others', () => {
    const before = renumberRoles([
        packRole(R.AILERON_LEFT), packRole(R.AILERON_RIGHT), packRole(R.ELEVATOR),
        packRole(R.RUDDER), packRole(R.GEAR), packRole(R.FLAP), 0,
    ]);
    // Flying wing: two elevons and a rudder
    const after = applyLayoutRoles(before, { 0: R.ELEVON_LEFT, 1: R.ELEVON_RIGHT, 2: R.RUDDER });
    assert.deepEqual(after.map(roleOf), [R.ELEVON_LEFT, R.ELEVON_RIGHT, R.RUDDER, 0, R.GEAR, 0, 0]);
    // Two servos per surface number up
    const two = applyLayoutRoles([0, 0, 0, 0], { 0: R.AILERON_LEFT, 1: R.AILERON_LEFT, 2: R.AILERON_RIGHT, 3: R.AILERON_RIGHT });
    assert.deepEqual(two.map(roleNumberOf), [1, 2, 1, 2]);
});
