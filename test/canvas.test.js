const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('canvas');
const { generateBoardImage, generateZoomedBoardImage, BOARD_IMAGE_EXTENSION } = require('../src/utils/canvas');

const players = Array.from({ length: 12 }, (_, i) => ({ discord_id: `p${i}`, position: 1 + (i * 4) % 45, etoiles: i % 4, pieces: i * 3, inventaire: [] }));
const mario = { game_mode: 'mario_party', game_map: 'night_sky', game_variant: 'standard', tour: 12, position_etoile: 20, pieges_actifs: [{ position: 7 }] };
const isJpeg = buffer => buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

test('the Mario board renders a full-size JPEG small enough for fast uploads', async () => {
  const buffer = await generateBoardImage(players, mario, null);
  assert.equal(BOARD_IMAGE_EXTENSION, 'jpg');
  assert.ok(isJpeg(buffer));
  const image = await loadImage(buffer);
  assert.deepEqual([image.width, image.height], [1920, 1080]);
  assert.ok(buffer.length < 1024 * 1024, `${buffer.length} bytes`);
});

test('island zones and the zoomed view render without Discord access', async () => {
  const island = { game_mode: 'ile_defis', game_map: 'board_game_island', game_variant: 'standard', tour: 3, position_etoile: 0 };
  const islanders = [{ discord_id: 'a', position: 40, etoiles: 0, pieces: 0, inventaire: [] }, { discord_id: 'b', position: 2, etoiles: 0, pieces: 0, inventaire: [] }];
  assert.ok(isJpeg(await generateBoardImage(islanders, island, null, 'volcan')));
  assert.ok(isJpeg(await generateZoomedBoardImage(players[0], players, mario, null)));
});
