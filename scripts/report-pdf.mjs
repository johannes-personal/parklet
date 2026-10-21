// Renders docs/01-rapport.md to docs/01-rapport.pdf: the report for Parklet's owner,
// with its screenshots embedded. Run `npm run docs:pdf` after changing the report.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { marked } from "marked";

const SOURCE = path.resolve("docs/01-rapport.md");
const TARGET = path.resolve("docs/01-rapport.pdf");

/** GitHub's heading anchors ("4.9 Nästa steg" → "49-nästa-steg"), so the report's own links work in the PDF. */
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slug(html)}">${html}</h${depth}>\n`;
    },
  },
});

const markdown = readFileSync(SOURCE, "utf8");
const title = markdown.match(/^# (.+)$/m)?.[1] ?? "Parklet";
const body = marked.parse(markdown);

const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>${title}</title>
<base href="${pathToFileURL(path.dirname(SOURCE))}/">
<style>
  @page { size: A4; margin: 20mm 18mm 22mm; }
  :root { --ink: #16181d; --soft: #4b5160; --muted: #7a8090; --line: #dfe2e8; --brand: #2f6fd6; --canvas: #f4f5f8; }
  html { font-family: Inter, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: var(--ink); }
  body { margin: 0; }
  h1 { font-size: 26pt; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 6mm; }
  h1 + p { color: var(--soft); }
  h2 { font-size: 17pt; letter-spacing: -0.01em; margin: 0 0 4mm; padding-top: 2mm; break-before: page; }
  h3 { font-size: 12.5pt; margin: 7mm 0 2mm; break-after: avoid; }
  h4 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
  li { margin: 0 0 1mm; }
  a { color: var(--brand); text-decoration: none; }
  strong { font-weight: 650; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 0.86em; background: var(--canvas); padding: 0.05em 0.3em; border-radius: 3px; }
  pre { background: var(--canvas); padding: 3mm; border-radius: 2mm; overflow: hidden; white-space: pre-wrap; font-size: 8.5pt; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  hr { display: none; }
  blockquote { margin: 0 0 3mm; padding: 1mm 0 1mm 4mm; border-left: 1mm solid var(--line); color: var(--soft); }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.8pt; line-height: 1.4; }
  th, td { text-align: left; vertical-align: top; padding: 1.6mm 2mm; border-bottom: 0.3mm solid var(--line); }
  th { font-weight: 650; background: var(--canvas); }
  tr { break-inside: avoid; }
  /* A screenshot and its caption ("*Bild 3. …*") stay together. */
  img { display: block; max-width: 100%; max-height: 150mm; margin: 2mm auto 1.5mm; border-radius: 2mm; box-shadow: 0 0 0 0.3mm var(--line); }
  p:has(> img) { break-inside: avoid; margin-bottom: 5mm; }
  p:has(> img) em, p:has(> img) + p > em:only-child { display: block; font-size: 8.8pt; color: var(--muted); font-style: normal; text-align: center; }
  img + p > em:only-child { display: block; font-size: 8.8pt; color: var(--muted); font-style: normal; text-align: center; }
</style>
</head>
<body>${body}</body>
</html>`;

// Opened as a file, not with setContent: a page from a string may not load the local screenshots.
const dir = mkdtempSync(path.join(tmpdir(), "parklet-report-"));
const file = path.join(dir, "rapport.html");
writeFileSync(file, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
  if (missing.length) throw new Error(`Images that didn't load: ${missing.join(", ")}`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.pdf({
    path: TARGET,
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font:8pt Inter,Arial,sans-serif;color:#7a8090;padding:0 18mm;display:flex;justify-content:space-between"><span>${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    outline: true,
    tagged: true,
  });
  console.log(`Wrote ${path.relative(process.cwd(), TARGET)}`);
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
