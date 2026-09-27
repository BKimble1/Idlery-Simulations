// Fresh loads for e2e/round4.spec.ts: open a page in a new browser each time (nothing warmed up
// by an earlier page) and report, per load, whether the page answered and showed its lesson.
// Run in its own process, so a frozen browser cannot hang the test runner.
//   node e2e/fresh-load.mjs <url> <runs> <expected text> '<launch args as JSON>'
import { chromium } from '@playwright/test';

const [, , url, runs = '4', text = '', argsJson = '[]'] = process.argv;
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const results = [];
for (let i = 0; i < Number(runs); i++) {
  const browser = await chromium.launch({ args: JSON.parse(argsJson) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // (a frozen renderer may not even finish loading the document)
  const answered = await Promise.race([
    page
      .goto(url, { waitUntil: 'domcontentloaded' })
      .then(() => page.evaluate(() => new Promise((r) => setTimeout(() => r(true), 500))))
      .catch(() => false),
    wait(15000, false),
  ]);
  const shown = answered ? await Promise.race([page.getByText(text).first().isVisible().catch(() => false), wait(10000, false)]) : false;
  results.push({ answered, shown });
  await Promise.race([browser.close().catch(() => {}), wait(5000)]);
}
console.log(JSON.stringify(results));
process.exit(0);
