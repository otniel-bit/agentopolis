// Landing-page hero: the actual Agentopolis renderer fed by the actual demo
// script — same files that ship in the npm package, no mockups.
// Everything is guarded so a renderer error can never blank the page copy.

import { createWorld, reduce, snapshot } from './state.js';
import { startDemo } from './demo.js';
import { createCity } from './city.js';

try {
  const canvas = document.getElementById('hero-canvas');
  if (canvas) {
    const world = createWorld();
    const city = createCity(canvas);
    let fitted = false;
    startDemo((evt) => {
      try {
        if (reduce(world, evt)) {
          city.setSnapshot(snapshot(world));
          if (!fitted) {
            city.fit();
            fitted = true;
          }
        }
      } catch (err) {
        console.warn('agentopolis hero: snapshot skipped —', err);
      }
    });
  }
} catch (err) {
  console.warn('agentopolis hero: renderer disabled —', err);
}

// Click-to-copy for the install command.
try {
  const box = document.getElementById('copy-cmd');
  if (box) {
    const label = box.querySelector('.copy-hint');
    box.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('npx agentopolis');
        if (label) {
          label.textContent = 'copied!';
          setTimeout(() => { label.textContent = 'click to copy'; }, 1600);
        }
      } catch {
        // Clipboard API unavailable (e.g. non-secure context): select the text.
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(box.querySelector('code'));
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }
} catch { /* copy affordance is optional */ }
