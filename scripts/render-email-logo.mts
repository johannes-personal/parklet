/**
 * Renders the "Parklet." wordmark as a PNG for e-mails (public/email/logo.png),
 * since mail clients don't support the gradient text the site uses.
 *
 *   node --import tsx scripts/render-email-logo.mts
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  await page.setContent(`<!doctype html>
    <style>
      body { margin: 0; background: transparent; }
      span { display: inline-block; padding: 2px 4px 6px; font: 700 28px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.025em;
             background: linear-gradient(to bottom right, #fff 45%, #93c5fd); -webkit-background-clip: text; color: transparent; }
    </style><span>Parklet.</span>`);
  await page.locator("span").screenshot({ path: "public/email/logo.png", omitBackground: true });
  const box = await page.locator("span").boundingBox();
  console.log(`public/email/logo.png ${Math.round(box!.width)}×${Math.round(box!.height)} css px`);
} finally {
  await browser.close();
}
