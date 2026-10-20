import { chromium } from "@playwright/test";
const [base, share] = [process.argv[2], process.argv[3]];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function run(who, paths) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${base}/?_vercel_share=${share}`);
  await p.goto(`${base}/logga-in`);
  await p.getByLabel("E-post").fill(who);
  await p.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
  let t = Date.now();
  await p.getByRole("button", { name: "Logga in" }).click();
  try { await p.waitForURL((u) => !u.pathname.includes("logga-in"), { timeout: 30000 }); console.log(who, "logged in", Date.now() - t, "ms"); }
  catch { console.log(who, "LOGIN HANG"); await ctx.close(); return; }
  for (const [path, text] of paths) {
    t = Date.now();
    await p.goto(base + path, { waitUntil: "commit" });
    try {
      await p.getByRole("button", { name: "Meny" }).waitFor({ timeout: 30000 });
      await p.getByText(text).first().waitFor({ timeout: 30000 });
      console.log(" ", path, "ok", Date.now() - t, "ms");
    } catch { console.log(" ", path, "HANG"); }
  }
  await ctx.close();
}
const site = process.argv[4] ?? "all";
await run("admin@parklet.test", [["/", "Parklet"], ["/admin", "Att granska"], ["/admin/platser", "Bokningsbar"], ["/admin/konton", "Utbetalning"], ["/admin", "Att granska"], ["/", "Parklet"]]);
await run("erik@parklet.test", [["/uthyrare", "Erik"], ["/mina-bokningar", "Mina bokningar"]]);
await b.close();
