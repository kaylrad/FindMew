import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePetPose,
  canGreet,
  GREETING_INTERVAL_MS,
  mewPoseFrames,
} from '../../frontend/src/lib/cat-poses.js';
test('low energy sleeps and the threshold of thirty stays awake', () => {
  assert.equal(resolvePetPose(29, null, 100), 'sleep');
  assert.equal(resolvePetPose(30, null, 100), 'idle');
});
test('petting and successful feeding use their original transient poses then return to energy state', () => {
  assert.equal(resolvePetPose(10, { pose: 'comfort', expiresAt: 200 }, 100), 'comfort');
  assert.equal(resolvePetPose(10, { pose: 'happy', expiresAt: 200 }, 100), 'happy');
  assert.equal(resolvePetPose(10, { pose: 'happy', expiresAt: 100 }, 100), 'sleep');
});
test('greetings run every thirty seconds only when awake, visible and not already interacting', () => {
  assert.equal(GREETING_INTERVAL_MS, 30000);
  assert.equal(canGreet(30, null, 100, true), true);
  assert.equal(canGreet(29, null, 100, true), false);
  assert.equal(canGreet(50, null, 100, false), false);
  assert.equal(canGreet(50, { pose: 'comfort', expiresAt: 200 }, 100, true), false);
});
test('every original pose viewport stays within the untouched Figma sheet and has valid face anchors', () => {
  for (const pose of ['idle', 'sleep', 'happy', 'comfort', 'greet', 'yawn']) {
    const frame = mewPoseFrames[pose];
    assert.ok(
      frame.width > 0 &&
        frame.height > 0 &&
        frame.x >= 0 &&
        frame.y >= 0 &&
        frame.x + frame.width <= 832 &&
        frame.y + frame.height <= 525
    );
    assert.ok(
      frame.eyesX > 0 && frame.eyesX < frame.width && frame.eyesY > 0 && frame.eyesY < frame.height
    );
  }
});
