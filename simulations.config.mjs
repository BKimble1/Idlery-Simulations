/**
 * The simulations FAB / ONE publishes. Each entry is one route (/<slug>) and one card on the
 * homepage, in this order (the card's number is its place in this list). Nothing else in the
 * site needs to change to add one: see "Adding a simulation" in README.md.
 *
 * A simulation is its own project in simulations/<slug>/ with its own dependencies. The site's
 * build (scripts/build.mjs) builds it with Vite at its route (base /<slug>/, output
 * dist/<slug>/), so it has to build a static site with Vite, use the base for every URL it
 * loads, and keep its own addresses under its route (query strings or /<slug>/… paths). The
 * build checks the page it wrote: everything it loads must come from /<slug>/.
 *
 * @typedef {object} Simulation
 * @property {string} slug        route and folder name: lowercase letters, digits and hyphens
 * @property {string} title       the card's title and the name used everywhere else
 * @property {string} tagline     one line under the title
 * @property {string} field       the engineering field, shown above the title
 * @property {string} summary     two or three sentences: what the visitor does and sees
 * @property {string[]} facts     three short facts (steps, machines, running time…)
 * @property {string} launch      the launch button's label
 * @property {{ mp4: string, webm: string, poster: string, alt: string }} preview
 *   the card's preview clip (H.264 MP4, and VP9 WebM for browsers without H.264) and its poster,
 *   in site/ (made by scripts/capture-preview.mjs); `alt` says what the clip shows
 * @property {string} [serviceWorker] a service worker the simulation registers, relative to its
 *   route; the site allows it to control the route's own address (/<slug>, without the slash)
 * @property {Record<string, string>} [env] environment variables for the simulation's build, in
 *   addition to the ones every simulation gets (VITE_FABONE_HOME=/, FABONE_BASE=/<slug>/,
 *   FABONE_OUT_DIR); for a project that names its settings differently
 * @property {string[][]} [build] the commands that build it, run in order in its folder, with
 *   {base} and {outDir} replaced; without this, `npm run build -- --base {base} --outDir {outDir}
 *   --emptyOutDir`, which only works when the project's build script ends with `vite build`
 * @property {Record<string, Record<string, string>>} [headers] response headers for files under
 *   the route (paths relative to it, `*` at the end for a folder), written to _headers; built
 *   files in /<slug>/assets/ are always cached for a year
 */

/** The site: its name, who makes it, and where it is published (for links shared elsewhere). */
export const site = {
  name: 'FAB / ONE',
  owner: 'Idlery',
  url: 'https://simulations.idlery.com',
};

/**
 * For files that keep their name when they change (no content hash): browsers use their copy
 * for an hour without asking, then check it again while showing it (a changed file is seen on
 * the next visit), instead of asking about every texture and sound on every visit.
 */
const REVALIDATED = { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' };

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
    preview: {
      mp4: 'media/photolithography/preview.mp4',
      webm: 'media/photolithography/preview.webm',
      poster: 'media/photolithography/poster.webp',
      alt: 'Recorded in the simulation: the scanner exposes the wafer with its light path shown; in the magnified cross-section, developer washes the exposed resist away; the finished inverter switches its output when the input is flipped; and the camera crosses the fab to the scanner.',
    },
    serviceWorker: 'sw.js',
  },
  {
    slug: 'rocket',
    title: 'Rocket Engineering',
    tagline: 'From the launch pad to orbit.',
    field: 'Aerospace engineering',
    summary:
      'Open up a two-stage rocket in the hangar and see how its engines, tanks and structures work, in cutaway or taken apart. Then follow six complete missions from the pad to orbit and back, including a booster landing and a capsule return, or watch them as narrated films.',
    facts: ['6 mission types', 'Interactive cutaways', 'Guided mission films'],
    launch: 'Launch simulation',
    preview: {
      mp4: 'media/rocket/preview.mp4',
      webm: 'media/rocket/preview.webm',
      poster: 'media/rocket/poster.webp',
      alt: 'Recorded in the simulation: the two-stage rocket stands on its launch pad, its engines ignite, a white cloud spreads across the pad and the rocket lifts off its mount; then, high above the Earth, with the booster\'s engines shut down, the two stages begin to separate.',
    },
    // KIMBLE Rocket Engineering names its way back VITE_HUB_URL and VITE_HUB_LABEL (src/config.ts)
    env: { VITE_HUB_URL: '/', VITE_HUB_LABEL: 'Back to FAB / ONE' },
    // its own `npm run build` (tsc -b && vite build), with the route's options given to vite itself
    build: [
      ['npx', 'tsc', '-b'],
      ['npx', 'vite', 'build', '--base', '{base}', '--outDir', '{outDir}', '--emptyOutDir'],
    ],
    // textures, the Earth and Moon maps and the narration keep their names from build to build
    headers: { 'textures/*': REVALIDATED, 'narration/*': REVALIDATED },
  },
  {
    slug: 'humanoid',
    title: 'Humanoid',
    tagline: 'Inside a machine built to move like us.',
    field: 'Robotics',
    summary:
      'Open up FO-H1, an original electric humanoid, system by system: its actuators, hands, vision, balance and battery. Change its design and watch the limits move, then run its joints, balance, walking and hands in seven live labs.',
    facts: ['29 actuated joints', '7 live labs', 'Guided tour'],
    launch: 'Launch simulation',
    preview: {
      mp4: 'media/humanoid/preview.mp4',
      webm: 'media/humanoid/preview.webm',
      poster: 'media/humanoid/poster.webp',
      alt: 'Recorded in the simulation: FO-H1, an original humanoid designed for it, stands alive in its dark test lab; its knee actuator slides out of the thigh and separates into motor, cycloidal reducer and bearings while it runs a stride of walking; the robot walks on the instrumented treadmill with its ground reactions shown; and it catches a 300 N push with a step.',
    },
  },
  {
    slug: 'automotive',
    title: 'Automotive',
    tagline: 'How a car becomes motion.',
    field: 'Automotive engineering',
    summary:
      'Open up S-1, an original modern sedan, from the start button to the tyres on the road: watch it start and fire in cutaway, follow the torque through the gearbox and differential, and see every system at work. Then change its gearing, springs and brakes in eight labs, and diagnose six real faults.',
    facts: ['Narrated film', '10 hero lessons', '6 faults to diagnose'],
    launch: 'Launch simulation',
    preview: {
      mp4: 'media/automotive/preview.mp4',
      webm: 'media/automotive/preview.webm',
      poster: 'media/automotive/poster.webp',
      alt: 'Recorded in the simulation: the S-1 sedan in its studio; the engine in cutaway as a cylinder fires; torque flowing from the crankshaft through the gearbox and driveshaft to the rear wheels; and the car taken apart into its systems.',
    },
    // the bundled narration keeps its file names from build to build
    headers: { 'narration/*': REVALIDATED },
  },
];
