import test from 'node:test';
import assert from 'node:assert/strict';
import { mewRooms } from '../../frontend/src/lib/mymew-catalog.js';
import {
  contrastRatio,
  negativeColor,
  wallTextColors,
  MIN_TEXT_CONTRAST,
} from '../../frontend/src/lib/wall-contrast.js';

test('every room wall gets readable text derived from its negative colour', () => {
  for (const room of mewRooms) {
    assert.match(room.wall, /^#[0-9a-f]{6}$/i, room.id);
    const colors = wallTextColors(room.wall);
    assert.equal(colors.negative, negativeColor(room.wall));
    assert.ok(contrastRatio(colors.ink, room.wall) >= 6.5, room.id + ' heading');
    assert.ok(contrastRatio(colors.muted, room.wall) >= MIN_TEXT_CONTRAST, room.id + ' caption');
  }
});

test('the negative keeps its direction: dark walls get light text and light walls dark text', () => {
  assert.equal(negativeColor('#575965'), '#a8a69a');
  const light = wallTextColors('#F6EBDD'),
    dark = wallTextColors('#496046');
  assert.ok(contrastRatio(light.ink, '#000000') < contrastRatio(light.ink, '#ffffff'));
  assert.ok(contrastRatio(dark.ink, '#ffffff') < contrastRatio(dark.ink, '#000000'));
  // A plain negative of a mid-tone wall is not readable; the adjustment is what makes it pass.
  assert.ok(contrastRatio(negativeColor('#575965'), '#575965') < MIN_TEXT_CONTRAST);
});
