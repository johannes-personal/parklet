// Screenshots of the new version's flows for docs/01-rapport.md (docs/images/flow-*.jpg).
//
// Against a local production build on fresh demo data, as the demo deployment runs:
//   npm run db:seed
//   NEXT_PUBLIC_DEMO=1 npm run build
//   NEXT_PUBLIC_DEMO=1 APP_URL=https://parklet-rebuild.vercel.app npx next start -p 3200
//   REPORT_BASE_URL=http://localhost:3200 node scripts/report-screenshots.mjs [name filter]
// It books, sends a landlord request and answers it, so seed again before a second run.
// Then `npm run docs:pdf`.
import path from "node:path";
import { chromium, devices } from "@playwright/test";
import { DateTime } from "luxon";
import postgres from "postgres";

const BASE = process.env.REPORT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("docs/images");
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const sql = postgres(process.env.DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet", { max: 1, onnotice: () => {} });
const browser = await chromium.launch();

const desktop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "sv-SE", timezoneId: "Europe/Stockholm" };
const phone = { ...devices["Pixel 7"], locale: "sv-SE", timezoneId: "Europe/Stockholm" };

async function page(email, ctx = desktop) {
  const p = await (await browser.newContext(ctx)).newPage();
  if (email) {
    await p.goto(`${BASE}/logga-in`);
    await p.getByLabel("E-post").fill(email);
    await p.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
    await p.getByRole("button", { name: "Logga in" }).click();
    await p.waitForURL((u) => !/logga-in/.test(u.pathname));
  }
  return p;
}
/**
 * A screenshot of the page above its footer: the viewport is resized to the content
 * (capped at 800 px, or `tall` px), so the sticky header and the map background stay
 * where they belong. `region` crops to a part: from the element `from` to `to`.
 */
async function shot(p, name, { tall = 800, region } = {}) {
  if (only && !only.test(name)) return;
  await p.waitForLoadState("networkidle").catch(() => {});
  const bottom = await p.evaluate(() => {
    const f = document.querySelector("footer");
    return Math.ceil(f ? f.getBoundingClientRect().top + window.scrollY : document.documentElement.scrollHeight);
  });
  const width = p.viewportSize().width;
  if (width >= 1000) await p.setViewportSize({ width, height: Math.max(600, Math.min(bottom, tall)) });
  await p.waitForTimeout(900);
  let clip;
  if (region) {
    await p.evaluate(() => window.scrollTo(0, 0));
    const a = await region.from.boundingBox();
    const b = await (region.to ?? region.from).boundingBox();
    const top = Math.max(0, a.y - (region.pad ?? 32));
    clip = { x: 0, y: top, width, height: Math.min(b.y + b.height + (region.pad ?? 32), p.viewportSize().height) - top };
  }
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 72, clip });
  if (width >= 1000) await p.setViewportSize({ width, height: 800 });
  console.log("saved", name);
}
const id = async (title) => (await sql`select id, host_account_id from spots where title = ${title}`)[0];
const local = (d, h, m = 0) => DateTime.now().setZone("Europe/Stockholm").plus({ days: d }).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm");

// --- Driver ---------------------------------------------------------------
{
  const p = await page(null);
  await p.goto(BASE);
  await shot(p, "flow-01-startsida");
  const from = local(2, 10), to = local(2, 13);
  await p.goto(`${BASE}/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746&from=${from}&to=${to}`);
  await p.getByTestId("search-result").first().waitFor();
  await p.waitForTimeout(2500); // map tiles
  await shot(p, "flow-02-sok");
  await p.getByText("Carport nära Liseberg").first().click();
  await p.getByRole("complementary", { name: "Carport nära Liseberg" }).waitFor();
  await p.waitForTimeout(1500);
  await shot(p, "flow-03-plats");
}
{
  const p = await page("forare@parklet.test");
  const spot = await id("Carport nära Liseberg");
  await p.goto(`${BASE}/plats/${spot.id}?from=${local(3, 10)}&to=${local(3, 12)}`);
  await p.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await p.getByRole("heading", { name: "Betala bokningen" }).waitFor();
  await shot(p, "flow-04-betala");
  await p.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await p.getByText("Din parkering är bokad och betald").waitFor();
  await shot(p, "flow-05-bokad", { tall: 1400 });
  await p.goto(`${BASE}/mina-sidor`);
  await shot(p, "flow-06-mina-sidor");
}
{
  const p = await page(null, phone);
  const spot = await id("Uppfart i Majorna");
  await p.goto(`${BASE}/plats/${spot.id}`);
  await p.waitForTimeout(1500);
  await shot(p, "flow-07-mobil-plats");
}

// --- Host -----------------------------------------------------------------
{
  const p = await page("ny@parklet.test");
  await p.goto(`${BASE}/uthyrare`);
  await p.getByRole("heading", { name: "Innan du kan ta emot bokningar" }).waitFor();
  await shot(p, "flow-08-checklista");
  await p.goto(`${BASE}/uthyrare/nytt`);
  await shot(p, "flow-09-bli-uthyrare");
}
{
  const p = await page("anna@parklet.test");
  const { host_account_id } = await id("Uppfart i Majorna");
  await p.goto(`${BASE}/uthyrare/${host_account_id}/platser/ny`);
  await p.getByRole("radio", { name: /Jag hyr platsen/ }).check();
  await p.getByRole("radio", { name: "Bostadsrättsföreningen" }).check();
  await p.getByRole("checkbox", { name: /Den tillfälliga hyresgästens bil måste registreras/ }).check();
  await shot(p, "flow-10-platsformular", {
    tall: 4000,
    region: { from: p.getByRole("heading", { name: "Din rätt att hyra ut platsen" }), to: p.getByText(/Efter att du sparat kan du skicka en godkännandeförfrågan/), pad: 60 },
  });

  // A draft copy of the BRF spot: documents and the request to the board.
  const [orig] = await sql`select id from spots where title = 'BRF-plats i Haga'`;
  await sql`delete from spots where title = 'Plats på Haga Nygata'`;
  await sql`create temp table copy as select * from spots where id = ${orig.id}`;
  const [draft] = await sql`update copy set id = gen_random_uuid(), title = 'Plats på Haga Nygata', review = 'draft', submitted_at = null,
      landlord_approval = 'missing', landlord_approval_token_hash = null, landlord_name = 'Brf Haga', landlord_email = 'styrelsen.haga@example.com' returning id`;
  await sql`insert into spots select * from copy`;
  await sql`drop table copy`;
  await sql`insert into availability_windows (spot_id, weekday, start_minute, end_minute) select ${draft.id}, weekday, start_minute, end_minute from availability_windows where spot_id = ${orig.id}`;
  await sql`insert into documents (host_account_id, spot_id, uploaded_by, kind, filename, storage_key, mime_type, size_bytes)
    select host_account_id, ${draft.id}, uploaded_by, kind, filename, storage_key, mime_type, size_bytes from documents where spot_id = ${orig.id}`;
  await p.goto(`${BASE}/uthyrare/${host_account_id}/platser/${draft.id}`);
  await p.getByRole("button", { name: "Skicka godkännandeförfrågan" }).click();
  await p.getByText("Förfrågan är skickad").first().waitFor();
  await shot(p, "flow-11-underlag", {
    tall: 4000,
    region: { from: p.getByRole("heading", { name: "Plats på Haga Nygata" }), to: p.getByRole("button", { name: "Skicka in för granskning" }), pad: 70 },
  });

  const [mail] = await sql`select text from mail_outbox where "to" = 'styrelsen.haga@example.com' order by id desc limit 1`;
  const token = mail.text.match(/\/godkannande\/([A-Za-z0-9_-]+)/)[1];
  const board = await page(null);
  await board.goto(`${BASE}/godkannande/${token}`);
  await board.getByLabel("Ditt namn").fill("Lena Sjö");
  await board.getByLabel("Din roll").fill("Ordförande");
  await board.getByRole("checkbox", { name: /måste registreras/ }).check();
  await shot(board, "flow-12-foreningens-godkannande", { tall: 1700 });
  await board.getByRole("checkbox", { name: /intygar/ }).check();
  await board.getByRole("button", { name: "Godkänn uthyrning" }).click();
  await board.getByText("Uthyrningen är godkänd").first().waitFor();

  await p.goto(`${BASE}/uthyrare`);
  await shot(p, "flow-13-uthyrarens-oversikt", { tall: 1500 });
  await p.goto(`${BASE}/uthyrare/${host_account_id}/platser`);
  await shot(p, "flow-20-uthyrarens-parkeringsplatser", { tall: 1500 });
  await p.goto(BASE);
  await p.getByRole("button", { name: /^Notiser/ }).click();
  await p.waitForTimeout(600);
  await shot(p, "flow-18-notiser");
}
{
  const p = await page("styrelsen@parklet.test");
  const garage = await id("Garage Linnégatan – Plats 1");
  await p.goto(`${BASE}/uthyrare/${garage.host_account_id}/granska`);
  await shot(p, "flow-14-bilar-att-registrera", { tall: 1400 });
  // Registering one car keeps it for the space: its list of registered cars.
  const row = p.getByRole("listitem").filter({ has: p.getByRole("button", { name: "Markera som registrerad" }) }).first();
  const reg = (await row.locator(".font-mono").innerText()).trim();
  await row.getByRole("button", { name: "Markera som registrerad" }).click();
  await p.waitForTimeout(1500);
  const [{ spot_id }] = await sql`select spot_id from spot_vehicle_approvals where reg = ${reg} order by approved_at desc limit 1`;
  await p.goto(`${BASE}/uthyrare/${garage.host_account_id}/platser/${spot_id}#bilar`);
  const cars = p.getByRole("region", { name: "Registrerade bilar" });
  await shot(p, "flow-21-registrerade-bilar", { tall: 4000, region: { from: cars, pad: 24 } });
}

// --- Admin ----------------------------------------------------------------
{
  const p = await page("admin@parklet.test");
  await p.goto(`${BASE}/admin`);
  await shot(p, "flow-15-granskningsko");
  const spot = await id("BRF-plats i Haga");
  await p.goto(`${BASE}/admin/platser/${spot.id}`);
  await shot(p, "flow-16-granska-plats", { tall: 1600 });
  await p.goto(`${BASE}/admin/epost`);
  await shot(p, "flow-17-epostlogg");
  await p.goto(`${BASE}/admin/bokningar`);
  await shot(p, "flow-22-admin-bokningar", { tall: 1200 });
  await p.goto(`${BASE}/admin/testdata`);
  await shot(p, "flow-19-testdata");
}

await browser.close();
await sql.end();
