// Renders every entry in posts.json to ../images/ using the pre-installed Playwright Chromium.
// Usage (from this folder):  node render.mjs            — all posts
//                            node render.mjs 03         — only files starting with "03"
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const posts = JSON.parse(readFileSync(path.join(here, "posts.json"), "utf8"));
const only = process.argv[2];
const page_url = pathToFileURL(path.join(here, "card.html")).href;

const browser = await chromium.launch();
for (const p of posts.filter(p => !only || p.file.startsWith(only))) {
  const w = p.w ?? 1080, h = p.h ?? 1080;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(page_url + "#" + encodeURIComponent(JSON.stringify(p)));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(here, "..", "images", p.file), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log("wrote", p.file);
}
await browser.close();
