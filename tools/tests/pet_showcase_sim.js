// Offline regression for the repository-only pet proposal. Run: node tools/tests/pet_showcase_sim.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('docs/proposals/pet-evolution-sprite-showcase.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'showcase script exists');
const initialImages = [...html.matchAll(/<img src="(data:image\/png;base64,[^"]+)" alt="[^"]+ idle sprite">/g)];
assert.equal(initialImages.length, 4, 'four Digimon have static images without JavaScript');
let draws = 0, nextFrame;
const ctx = { clearRect() {}, drawImage(...args) { assert.equal(args.length, 9); draws++; }, imageSmoothingEnabled: true };
const ro = { appendChild() {} };
const digiImages = initialImages.map((m) => ({ src: m[1] }));
const digi = { querySelectorAll: () => digiImages };
const paths = { innerHTML: '' };
const makeButtons = (key, values) => values.map((v) => ({ dataset: { [key]: v }, classList: { toggle() {} } }));
const roButtons = makeButtons('ro', ['idle', 'walk', 'attack']);
const digiButtons = makeButtons('digi', ['idle', 'walking', 'attack']);
const document = {
  getElementById: (id) => ({ ro, digi, paths })[id],
  createElement: () => ({ className: '', innerHTML: '', querySelector: () => ({ getContext: () => ctx }) }),
  querySelectorAll: (selector) => selector === '[data-ro]' ? roButtons : digiButtons,
};
class ImageStub { constructor() { this.complete = true; this.naturalWidth = 100; } }
let clock = 1000;
vm.runInNewContext(script, { document, Image: ImageStub, performance: { now: () => clock }, requestAnimationFrame: (cb) => { nextFrame = cb; } });
// A requestAnimationFrame timestamp can be earlier than performance.now() at startup or after a click.
nextFrame(999);
assert.equal(draws, 20, 'all Ragnarok pets draw even with a slightly earlier frame timestamp');
const initialSrc = digiImages[0].src;
roButtons[2].onclick();
digiButtons[2].onclick();
nextFrame(999);
assert.equal(draws, 40, 'all Ragnarok attack frames draw after a mode change');
assert.ok(digiImages.every((i) => i.src.startsWith('data:image/png;base64,')), 'Digimon frames are populated');
assert.notEqual(digiImages[0].src, initialSrc, 'Digimon attack changes the image');
assert.ok(paths.innerHTML.includes('Poring'), 'evolution paths render');
assert.ok(html.includes('id="full-proposal"'), 'complete proposal is included offline');
console.log('pet showcase: startup, mode change, four Digimon fallbacks and full proposal passed');
