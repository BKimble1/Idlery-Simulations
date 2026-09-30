/**
 * The homepage's simulation cards, written into index.html at build time from
 * simulations.config.mjs (so the page needs no script to show them, and search engines and
 * link previews see them too). Every simulation gets the same card, numbered in the config's
 * order: a row with its preview beside its description on wide screens, stacked on phones.
 */
import type { Simulation } from '../simulations.config.mjs';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ARROW = `<svg width="18" height="12" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h17M12 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PLAY = `<svg class="i-play" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6 L10.4 6 L3 10.4 Z" fill="currentColor"/></svg>`;
const PAUSE = `<svg class="i-pause" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor"/><rect x="7" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor"/></svg>`;

function card(s: Simulation, index: number): string {
  const id = `sim-${s.slug}`;
  const num = String(index + 1).padStart(2, '0');
  return `
        <article class="card" aria-labelledby="${id}">
          <div class="card__media">
            <div class="card__screen" data-preview>
              <video class="card__video" muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback
                width="1280" height="720" poster="/${esc(s.preview.poster)}" aria-hidden="true" tabindex="-1">
                <source src="/${esc(s.preview.mp4)}" type='video/mp4; codecs="avc1.640028"' />
                <source src="/${esc(s.preview.webm)}" type='video/webm; codecs="vp9"' />
              </video>
              <button class="card__toggle" type="button" data-preview-toggle hidden aria-label="Play the preview">${PLAY}${PAUSE}</button>
            </div>
            <p class="sr-only">${esc(s.preview.alt)}</p>
          </div>
          <div class="card__body">
            <p class="card__field"><span class="card__num">${num}</span>${esc(s.field)}</p>
            <h3 class="card__title" id="${id}">${esc(s.title)}</h3>
            <p class="card__tagline">${esc(s.tagline)}</p>
            <p class="card__summary">${esc(s.summary)}</p>
            <ul class="card__facts">${s.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            <a class="card__launch btn btn--primary" href="/${s.slug}" aria-label="${esc(s.launch)}: ${esc(s.title)}">${esc(s.launch)}${ARROW}</a>
          </div>
        </article>`;
}

export function renderCards(simulations: Simulation[]): string {
  return `<div class="cards">${simulations.map((s, i) => card(s, i)).join('')}
        </div>`;
}
