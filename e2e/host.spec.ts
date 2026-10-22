import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { E2E_DB, e2eDb, lastMailLink, localAt, login, logout, payOnStripe, pickRange, signIn } from "./helpers";

const fixture = (name: string) => path.resolve("e2e/fixtures", name);

test("a new host onboards, proves the right to rent via BRF approval, and gets approved", async ({ page }) => {
  const email = `host-${Date.now()}@example.com`;

  // Register
  await page.goto("/registrera?next=/uthyrare");
  await page.getByLabel("För- och efternamn").fill("Lisa Uthyrare");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill("ett riktigt bra lösenord");
  await page.getByRole("checkbox", { name: /godkänner/ }).check();
  await page.getByRole("button", { name: "Skapa konto" }).click();

  // /uthyrare is the one way into hosting: without an account it explains how it works.
  await expect(page.getByRole("heading", { name: "Tjäna pengar på platsen som ändå står tom" })).toBeVisible();
  await page.getByRole("link", { name: "Kom igång" }).click();

  // Host account as private person
  await expect(page.getByRole("heading", { name: "Bli uthyrare" })).toBeVisible();
  await page.getByRole("radio", { name: /Privatperson/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByRole("heading", { name: "Innan du kan ta emot bokningar" })).toBeVisible();

  // BankID through the fake Idura: cancelling first returns with a message, then approve.
  await page.getByRole("link", { name: "Legitimera dig" }).click();
  await page.getByRole("button", { name: "Legitimera med BankID" }).click();
  await expect(page.getByRole("heading", { name: "Fake BankID" })).toBeVisible();
  await page.getByRole("button", { name: "Avbryt" }).click();
  await expect(page.getByText("Legitimeringen avbröts.")).toBeVisible();
  await page.getByRole("button", { name: "Legitimera med BankID" }).click();
  await page.getByRole("button", { name: "Godkänn" }).click();
  await expect(page.getByRole("heading", { name: "Innan du kan ta emot bokningar" })).toBeVisible();

  // The verified name is kept and the personnummer only in encrypted form.
  const sql = postgres(E2E_DB, { max: 1 });
  const [stored] = await sql`select identity_provider, identity_name, personnummer_encrypted from users where email = ${email}`;
  await sql.end();
  expect(stored).toMatchObject({ identity_provider: "idura-sebankid", identity_name: "Lisa Uthyrare" });
  expect(stored.personnummer_encrypted).toMatch(/^v1\./);
  expect(stored.personnummer_encrypted).not.toContain("199001012384");

  // Payouts: Stripe Connect onboarding (the fake), prefilled with the BankID name.
  await page.getByRole("button", { name: "Koppla utbetalningskonto" }).click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Connect" })).toBeVisible();
  await expect(page.getByText("Namn: Lisa Uthyrare")).toBeVisible();
  await page.getByRole("button", { name: "Skicka in uppgifter" }).click();
  await expect(page.getByText("Utbetalningskontot är kopplat.")).toBeVisible();
  const accountUrl = new URL(page.url()).pathname;

  // Create a spot rented from a BRF
  await page.getByRole("link", { name: "Lägg upp en plats" }).first().click();
  await page.getByLabel("Adress", { exact: true }).fill("Vegagatan 12");
  await page.getByRole("textbox", { name: "Ort", exact: true }).fill("Göteborg");
  await page.getByTestId("location-picker").locator("canvas").waitFor();
  await page.getByTestId("location-picker").click(); // places the pin
  await page.getByLabel("Rubrik").fill("Plats i Linnéstaden");
  await page.getByRole("radio", { name: /Jag hyr platsen/ }).check();
  await page.getByRole("radio", { name: "Bostadsrättsföreningen" }).check();
  await page.getByLabel("Föreningens namn").fill("Brf Vegan");
  await page.getByLabel("E-post till styrelsen").fill("styrelsen.vegan@example.com");
  await page.getByLabel("Pris per timme (kr)").fill("20");
  await page.getByRole("button", { name: "Spara och fortsätt till underlag" }).click();
  await expect(page.getByText("Platsen är sparad.")).toBeVisible();

  // Submitting without documents is refused
  await page.getByRole("button", { name: "Skicka in för granskning" }).click();
  await expect(page.getByText(/Det saknas underlag/).first()).toBeVisible();

  // Upload the rental contract into its own slot (choosing the file uploads it)
  const contract = page.getByRole("region", { name: /Hyresavtal för platsen/ });
  await contract.getByLabel(/^Välj fil/).setInputFiles(fixture("hyresavtal.pdf"));
  await expect(contract.getByText("hyresavtal.pdf är uppladdad.")).toBeVisible();
  await expect(contract.getByRole("link", { name: "hyresavtal.pdf" })).toBeVisible();

  // An optional document can be added with a type, and removed again
  const other = page.getByRole("region", { name: /Övriga dokument/ });
  await other.getByLabel("Typ av dokument").selectOption("landlord_rules");
  await other.getByLabel(/^Välj fil/).setInputFiles({ name: "regler.pdf", mimeType: "application/pdf", buffer: readFileSync(fixture("hyresavtal.pdf")) });
  await expect(other.getByRole("link", { name: "regler.pdf" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await other.getByRole("button", { name: "Ta bort regler.pdf" }).click();
  await expect(other.getByText("regler.pdf är borttagen.")).toBeVisible();
  await expect(other.getByRole("link", { name: "regler.pdf" })).toHaveCount(0);

  // Ask the BRF for approval and answer as the board
  await page.getByRole("button", { name: "Skicka godkännandeförfrågan" }).click();
  await expect(page.getByText("Förfrågan är skickad")).toBeVisible();
  const spotUrl = new URL(page.url()).pathname;
  await logout(page);

  await page.goto(lastMailLink("/godkannande/"));
  await expect(page.getByRole("heading", { name: "Får parkeringsplatsen hyras ut via Parklet?" })).toBeVisible();
  await page.getByLabel("Ditt namn").fill("Per Styrelse");
  await page.getByLabel("Din roll").fill("Ordförande");
  await page.getByRole("checkbox", { name: /måste registreras/ }).check();
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Godkänn uthyrning" }).click();
  await expect(page.getByText("Uthyrningen är godkänd")).toBeVisible();

  // Host submits for review
  await login(page, email, "ett riktigt bra lösenord");
  await page.goto(spotUrl);
  await expect(page.getByText("Godkänt av Per Styrelse (Ordförande)")).toBeVisible();
  await page.getByRole("button", { name: "Skicka in för granskning" }).click();
  await expect(page.getByText(/^Inskickad/)).toBeVisible();
  await expect(page.getByText("Granskas av Parklet")).toBeVisible();
  await logout(page);

  // Not in search before review (wait for the results, or the check proves nothing)
  await page.goto("/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746");
  await expect(page.getByTestId("search-result").first()).toBeAttached();
  await expect(page.getByText("Plats i Linnéstaden")).toHaveCount(0);

  // Admin is notified, can find the spot in the search, and approves it
  await signIn(page, "admin@parklet.test");
  await page.goto("/");
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByRole("link", { name: /Ny plats att granska: Plats i Linnéstaden/ })).toBeVisible();
  await page.goto("/admin/platser?q=Linn%C3%A9staden");
  await expect(page.getByRole("link", { name: "Plats i Linnéstaden" })).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("link", { name: /Plats i Linnéstaden/ }).click();
  await expect(page.getByText("Godkänt via länk av Per Styrelse")).toBeVisible();
  await page.getByRole("button", { name: "Godkänn" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await logout(page);

  // Now bookable; the BRF's registration rule is enforced
  await signIn(page, "forare@parklet.test");
  await page.goto(spotUrl.replace(/.*platser\//, "/plats/"));
  await expect(page.getByText("Krävs av föreningen.")).toBeVisible();
  const form = page.getByRole("form", { name: "Boka platsen" });
  await pickRange(form, localAt(3, 10), localAt(3, 12));
  await page.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await page.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await payOnStripe(page);
  await expect(page.getByText("Väntar på att uthyraren registrerar bilen")).toBeVisible();
  const bookingUrl = new URL(page.url()).pathname;
  await logout(page);

  // The host sees the car to register in the bell
  await signIn(page, email);
  await page.goto("/");
  await page.getByRole("button", { name: /^Notiser, \d+ nya/ }).click();
  await expect(page.getByRole("link", { name: /Registrera ABC123/ })).toBeVisible();
  await page.getByRole("link", { name: "Registrera en bil" }).click();
  await expect(page).toHaveURL(new RegExp(`${accountUrl}/granska#bilar$`));

  // Host registers the car
  await expect(page.getByRole("heading", { name: "Bilar att registrera" })).toBeVisible();
  await expect(page.getByText("ABC123", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Markera som registrerad" }).click();
  await expect(page.getByRole("heading", { name: /Bilar att registrera/ })).toHaveCount(0);
  // The car is now registered for the spot, for next time.
  await page.getByRole("navigation", { name: "Uthyrarkonto" }).getByRole("link", { name: "Parkeringsplatser" }).click();
  await page.getByRole("link", { name: "Plats i Linnéstaden" }).click();
  await expect(page.getByRole("region", { name: "Registrerade bilar" }).getByText("ABC123", { exact: true })).toBeVisible();
  await logout(page);

  await signIn(page, "forare@parklet.test");
  await page.goto("/");
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await page.getByRole("link", { name: /ABC123 är registrerad/ }).click();
  await expect(page).toHaveURL(new RegExp(`${bookingUrl}$`));
  await expect(page.getByText(/^Registrerad/)).toBeVisible();
});

test("an association verifies itself and invites another administrator", async ({ page }) => {
  await signIn(page, "anna@parklet.test");
  await page.goto("/uthyrare/nytt");
  await page.getByRole("radio", { name: /Bostadsrättsförening/ }).check();
  await page.getByText("Uppgifter om organisationen").click();
  await page.getByLabel("Organisationens namn").fill("Brf Testgården");
  await page.getByLabel("Organisationsnummer").fill("123456-7890"); // invalid checksum
  await page.getByLabel("Din roll").fill("Kassör");
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByText("Ange ett giltigt organisationsnummer")).toBeVisible();

  // Valid checksum, but Bolagsverket doesn't know it; then one that is deregistered.
  await page.getByLabel("Organisationsnummer").fill("802000-5552");
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByText("Vi hittar ingen organisation med det numret hos Bolagsverket.")).toBeVisible();
  await page.getByLabel("Organisationsnummer").fill("769600-9997");
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByText("Brf Nedlagd är avregistrerad hos Bolagsverket.")).toBeVisible();

  // Found: the account takes the registered name rather than the typed one.
  await page.getByLabel("Organisationsnummer").fill("769600-1234");
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByRole("heading", { name: "Bostadsrättsföreningen Testgården" })).toBeVisible();

  await page.getByLabel("Typ av dokument").selectOption("org_registration");
  await page.getByLabel(/^Fil/).setInputFiles(fixture("hyresavtal.pdf"));
  await page.getByRole("button", { name: "Ladda upp" }).click();
  await expect(page.getByText("är uppladdad")).toBeVisible();
  await page.getByLabel("Typ av dokument").selectOption("board_minutes");
  await page.getByLabel(/^Fil/).setInputFiles(fixture("hyresavtal.pdf"));
  await page.getByRole("button", { name: "Ladda upp" }).click();
  await page.getByRole("button", { name: "Skicka in för verifiering" }).click();
  await expect(page.getByText("Underlagen granskas av Parklet.")).toBeVisible();

  await page.getByRole("navigation", { name: "Uthyrarkonto" }).getByRole("link", { name: "Administratörer" }).click();
  await page.getByPlaceholder("namn@exempel.se").fill("erik@parklet.test");
  await page.getByRole("button", { name: "Bjud in" }).click();
  await expect(page.getByText("Inbjudan skickad till erik@parklet.test")).toBeVisible();
  await logout(page);

  await signIn(page, "erik@parklet.test");
  await page.goto(lastMailLink("/inbjudan/"));
  await page.getByRole("button", { name: "Acceptera inbjudan" }).click();
  await expect(page.getByRole("heading", { name: "Bostadsrättsföreningen Testgården" })).toBeVisible();

  // The reviewer sees what Bolagsverket said.
  await logout(page);
  await signIn(page, "admin@parklet.test");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Bostadsrättsföreningen Testgården" }).click();
  await expect(page.getByText("Bostadsrättsföreningen Testgården · Bostadsrättsförening · aktiv")).toBeVisible();
});

test("uploads are checked by content, not by file name", async ({ page }) => {
  await signIn(page, "ny@parklet.test");
  await page.goto("/uthyrare");
  await page.getByRole("link", { name: "Lägg upp en plats" }).first().click();
  await page.getByLabel("Adress", { exact: true }).fill("Storgatan 1");
  await page.getByRole("textbox", { name: "Ort", exact: true }).fill("Uppsala");
  await page.getByTestId("location-picker").locator("canvas").waitFor();
  await page.getByTestId("location-picker").click();
  await page.getByLabel("Rubrik").fill("Test av uppladdning");
  await page.getByRole("radio", { name: /äger platsen/ }).check();
  await page.getByLabel("Pris per timme (kr)").fill("10");
  await page.getByRole("button", { name: "Spara och fortsätt till underlag" }).click();
  const proof = page.getByRole("region", { name: /Bevis på att du äger platsen/ });
  await proof.getByLabel(/^Välj fil/).setInputFiles({ name: "lagfart.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(proof.getByText(/Ladda upp en PDF eller en bild/)).toBeVisible();
  // Over the platform's request limit (4.5 MB): refused in the browser, with the same message.
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024, 0x20)]);
  await proof.getByLabel(/^Välj fil/).setInputFiles({ name: "stor.pdf", mimeType: "application/pdf", buffer: big });
  await expect(proof.getByText("Filen är större än 4 MB. Ta ett foto med lägre upplösning eller ladda upp en PDF.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a company is checked against Bolagsverket and takes its registered name", async ({ page }) => {
  await signIn(page, "erik@parklet.test");
  await page.goto("/uthyrare/nytt");
  await page.getByRole("radio", { name: /Företag eller fastighetsägare/ }).check();
  await page.getByText("Uppgifter om organisationen").click();
  await page.getByLabel("Organisationens namn").fill("Testbolaget");
  await page.getByLabel("Organisationsnummer").fill("556012-5790");
  await page.getByLabel("Din roll").fill("Förvaltare");
  await page.getByRole("checkbox", { name: /intygar/ }).check();
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.getByRole("heading", { name: "Testbolaget Fastigheter AB" })).toBeVisible();
  await expect(page.getByText("Org.nr 556012-5790")).toBeVisible();
  // An organisation waits for Parklet's verification before its spots can be booked.
  await expect(page.getByRole("heading", { name: "Innan du kan ta emot bokningar" })).toBeVisible();
});

test("a board member with a Parklet account also finds the approval request in the bell", async ({ page }) => {
  // A draft copy of Anna's BRF spot, asking the board at an address that has an account.
  const sql = e2eDb();
  const title = `Godkännandeplats ${Date.now()}`;
  await sql`create temp table copy as select * from spots where title = 'BRF-plats i Haga'`;
  const [spot] = await sql`
    update copy set id = gen_random_uuid(), title = ${title}, review = 'draft', submitted_at = null,
      landlord_approval = 'missing', landlord_approval_token_hash = null, landlord_email = 'styrelsen@parklet.test'
    returning id, host_account_id`;
  await sql`insert into spots select * from copy`;
  await sql.end();

  try {
    await signIn(page, "anna@parklet.test");
    await page.goto(`/uthyrare/${spot.host_account_id}/platser/${spot.id}`);
    await page.getByRole("button", { name: "Skicka godkännandeförfrågan" }).click();
    await expect(page.getByText("Förfrågan är skickad")).toBeVisible();
    // The e-mail goes out as before.
    expect(lastMailLink("/godkannande/")).toMatch(/^\/godkannande\//);
    await logout(page);

    await signIn(page, "styrelsen@parklet.test");
    await page.goto("/");
    await page.getByRole("button", { name: /^Notiser/ }).click();
    await page.getByRole("link", { name: /Godkännande begärt: parkeringsplats på Haga Nygata 20/ }).click();
    await expect(page.getByRole("heading", { name: "Får parkeringsplatsen hyras ut via Parklet?" })).toBeVisible();
  } finally {
    const cleanup = e2eDb();
    await cleanup`delete from spots where id = ${spot.id}`;
    await cleanup.end();
  }
});
