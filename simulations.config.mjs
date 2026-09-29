/**
 * The simulations FAB / ONE publishes. Each entry is one route (/<slug>) and one card on the
 * homepage, in this order; the first entry marked `featured` gets the wide card. Nothing else
 * in the site needs to change to add one: see "Adding a simulation" in README.md.
 *
 * A simulation is its own project in simulations/<slug>/ with its own dependencies. The site's
 * build (scripts/build.mjs) runs its `npm run build -- --base /<slug>/ --outDir …`, so it has to
 * build a static site with Vite (or accept those two options), use the base for every URL it
 * loads, and keep its own addresses under its route (query strings or /<slug>/… paths).
 *
 * @typedef {object} Simulation
 * @property {string} slug        route and folder name: lowercase letters, digits and hyphens
 * @property {string} title       the card's title and the name used everywhere else
 * @property {string} tagline     one line under the title
 * @property {string} field       the engineering field, shown above the title
 * @property {string} summary     two or three sentences: what the visitor does and sees
 * @property {string[]} facts     three short facts (steps, machines, running time…)
 * @property {string} launch      the launch button's label
 * @property {boolean} [featured] the wide card
 * @property {{ mp4: string, webm: string, poster: string, alt: string }} preview
 *   the card's preview clip (H.264 MP4, and VP9 WebM for browsers without H.264) and its poster,
 *   in site/ (made by scripts/capture-preview.mjs); `alt` says what the clip shows
 * @property {string} [serviceWorker] a service worker the simulation registers, relative to its
 *   route; the site allows it to control the route's own address (/<slug>, without the slash)
 */

/** The site: its name, who makes it, and where it is published (for links shared elsewhere). */
export const site = {
  name: 'FAB / ONE',
  owner: 'Idlery',
  url: 'https://simulations.idlery.com',
};

/** @type {Simulation[]} */
export default [
  {
    slug: 'photolithography',
    title: 'Photolithography',
    tagline: 'Build a chip, layer by layer.',
    field: 'Semiconductor manufacturing',
    summary:
      'Follow one silicon wafer through a fab until it becomes a working inverter: coat it, expose it in a scanner, develop, etch and test it. Change the spin speed, the dose or the overlay, and the chip changes with it.',
    facts: ['37 guided steps', '15 machines', 'Narrated film'],
    launch: 'Launch simulation',
    featured: true,
    preview: {
      mp4: 'media/photolithography/preview.mp4',
      webm: 'media/photolithography/preview.webm',
      poster: 'media/photolithography/poster.webp',
      alt: 'Recorded in the simulation: the scanner exposes the wafer with its light path shown; in the magnified cross-section, developer washes the exposed resist away; the finished inverter switches its output when the input is flipped; and the camera crosses the fab to the scanner.',
    },
    serviceWorker: 'sw.js',
  },
];
