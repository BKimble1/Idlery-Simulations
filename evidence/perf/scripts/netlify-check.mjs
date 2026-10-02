// Netlify's own parsers and matcher on a built or extracted site:  node check2.mjs <dir>
import { parseAllRedirects } from '@netlify/redirect-parser';
import { parseAllHeaders } from '@netlify/headers-parser';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const redirector = require('netlify-redirector');
const dir = process.argv[2];
const r = await parseAllRedirects({ redirectsFiles: [`${dir}/_redirects`], netlifyConfigPath: undefined, minimal: true });
const h = await parseAllHeaders({ headersFiles: [`${dir}/_headers`], netlifyConfigPath: undefined, minimal: true });
console.log(`redirect rules ${r.redirects.length} (parse errors ${r.errors.length}); header rules ${h.headers.length} (parse errors ${h.errors.length})`);
for (const x of r.redirects) console.log(`  ${x.from} -> ${x.to} ${x.status}${x.force ? '!' : ''}`);
const m = await redirector.parsePlain(readFileSync(`${dir}/_redirects`, 'utf8'), {});
const test = (path, q = '') => {
  const x = m.match({ scheme: 'https', host: 'x.netlify.app', path, query: q, getHeader: () => '', getCookie: () => '' });
  return x ? `${x.to} ${x.status}${x.force ? '!' : ''}` : 'none';
};
const cases = [
  ['/', '', 'none'],
  ...['photolithography', 'rocket', 'humanoid', 'automotive'].flatMap((s) => [[`/${s}`, '', `/${s}/index.html 200!`], [`/${s}/`, '', `/${s}/index.html 200!`], [`/${s}/assets/missing.js`, '', 'none'], [`/${s}/index.html`, '', 'none']]),
  ['/automotive', 'mode=watch&t=120', '/automotive/index.html 200!'],
  ['/automotive', 'mode=explore&system=brakes&part=brake-caliper', '/automotive/index.html 200!'],
  ['/automotive', 'mode=engineer&lab=braking', '/automotive/index.html 200!'],
  ['/automotive', 'mode=simulate&scenario=overheat', '/automotive/index.html 200!'],
  ['/automotive/assets/missing.bin', '', 'none'],
  ['/humanoid', 'mode=simulate&lab=walk', '/humanoid/index.html 200!'],
  ['/rocket', 'v=mission&m=leo', '/rocket/index.html 200!'],
  ['/photolithography', 'step=expose', '/photolithography/index.html 200!'],
  ['/nope', '', 'none'],
];
let bad = 0;
for (const [p, q, want] of cases) {
  const got = test(p, q);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${p}${q ? '?' + q : ''} => ${got}${ok ? '' : ` (expected ${want})`}`);
}
console.log(bad ? `${bad} mismatches` : 'all rules match as intended');
process.exit(bad || r.errors.length || h.errors.length ? 1 : 0);
