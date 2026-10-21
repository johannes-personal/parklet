# Manual test plan: main flows

Run against https://parklet-rebuild.vercel.app after the latest deploy.

Markers:
- 📧 the flow sends a real e-mail: use an address you can read.
- ⚙ Stripe wording that isn't final yet. The payment integration is moving from the mock to
  **Stripe Connect in test mode**; replace each ⚙ placeholder with the real label once it has landed.

## Contents

- [Before you start: Återställ testdata](#before-you-start-återställ-testdata)
- [Accounts](#accounts) · [Demo spots](#demo-spots)
- **Drivers**
  1. [Find, share, book, cancel](#1-driver-find-share-book-cancel)
  2. [Booking rules: notice, duration, opening hours, old links](#2-booking-rules-notice-duration-opening-hours-old-links)
  3. [Two drivers, one slot](#3-two-drivers-one-slot)
  4. [Booking where the car must be registered](#4-booking-where-the-car-must-be-registered)
  5. [Cancelling: in time, too late, by the host](#5-cancelling-in-time-too-late-by-the-host)
- **Becoming a host**
  6. [Private person who owns the spot](#6-private-person-who-owns-the-spot)
  7. [Private person renting from a BRF, approval by e-mail link](#7-private-person-renting-from-a-brf-approval-by-e-mail-link-)
  8. [Private person renting from a landlord, uploaded approval](#8-private-person-renting-from-a-landlord-uploaded-approval)
  9. [The BRF or landlord says no](#9-the-brf-or-landlord-says-no-)
  10. [A BRF: several spots, shared documents, verification, co-administrator](#10-a-brf-several-spots-shared-documents-verification-co-administrator-)
  11. [A company checked against Bolagsverket](#11-a-company-checked-against-bolagsverket)
  12. [Link-only spots, pausing, editing an approved spot](#12-link-only-spots-pausing-editing-an-approved-spot)
- **Admin review**
  13. [Notified, search, approve](#13-admin-notified-search-approve-)
  14. [Reject with a reason, fix, resubmit](#14-reject-with-a-reason-fix-resubmit)
  15. [Remove a spot's approval](#15-remove-a-spots-approval)
  16. [Remove a household's approval](#16-remove-a-households-approval)
  17. [Organisation: reject, verify, remove, verify again](#17-organisation-reject-verify-remove-verify-again)
- **Payments (Stripe test mode)** ⚙
  18. [Paying: success, 3-D Secure, declined](#18-paying-success-3-d-secure-declined-)
  19. [Leaving the payment: the hold expires](#19-leaving-the-payment-the-hold-expires-)
  20. [Refunds](#20-refunds-)
  21. [Host connects payouts with Stripe](#21-host-connects-payouts-with-stripe-)
  22. [Checking it in the Stripe dashboard](#22-checking-it-in-the-stripe-dashboard-)
- **Everything else**
  23. [Password reset](#23-password-reset-)
  24. [Forms keep what was typed](#24-forms-keep-what-was-typed)
  25. [The bell, per role](#25-the-bell-per-role)
  26. [Access rules](#26-access-rules)
  27. [Phone checks](#27-phone-checks)
  28. [Daily summary](#28-daily-summary-)

---

## Before you start: Återställ testdata

Reset first, so every flow starts from the state described below.

1. Log in as `johannes@jvo.se` (or `admin@parklet.test`) and open `/admin/testdata`.
2. Click **Återställ testdata**.
   - The demo accounts in the table below are back to their starting state.
   - Accounts with real addresses that were created during testing (for example `snyggast@jvo.se`) are **deleted**, so the same address can register again.
   - Your own admin login (`johannes@jvo.se`) is kept.
   - The page is for admins only, and only in the demo deployment.

Reset again whenever a flow leaves things in a state the next one doesn't expect.

## Accounts

All demo accounts use the password **`parklet-demo-1`**. Their addresses end
in `.test`, so their e-mails are **not delivered**. Admins can read them all,
rendered, at **Granskning → E-post** (the 50 latest). To check real delivery, use your own
address (see the flows marked 📧).

| Login | Who | Use it for |
|---|---|---|
| `admin@parklet.test` | Parklet reviewer (admin) | Review queue, search, e-mail log |
| `forare@parklet.test` | Oskar, a driver with car ABC123 and bookings | Booking and cancelling |
| `anna@parklet.test` | Anna, private host (Göteborg, Stockholm, Uppsala) | Host dashboard, a spot waiting for review |
| `erik@parklet.test` | Erik, private host and owner of Kvarteret Fastigheter AB | Two host accounts |
| `styrelsen@parklet.test` | Sara, board of Brf Linnéstaden (its cars must be registered) | Registering a car |
| `ny@parklet.test` | Maja, new host without BankID or payouts | "Not bookable yet" states |
| `johannes@jvo.se` | You: admin and host | 📧 Real admin e-mails and the daily summary |

Notes:
- Payments: Stripe test mode ⚙ (until it lands: the mock button **Betala … (testläge)**).
- BankID goes through Idura's test environment: you need a **test BankID**.
- For a new 📧 account, register with a real address you can read (for example `snyggast@jvo.se`, or a `+` alias if your mail supports it). The reset deletes it again.
- A host can't book a spot of their own host account: the booking box says "Det här är en plats som ditt uthyrarkonto hyr ut." Book as Oskar.

## Demo spots

All demo spots: minimum booking 1 hour, free cancellation until 2 hours before the start.

| Spot | Host | Rules worth knowing |
|---|---|---|
| Carport nära Liseberg (Göteborg) | Erik | Always open, 30 kr/h, max 200 kr/day, no notice |
| Garage Linnégatan – Plats 1, 2, 3 (Göteborg) | Brf Linnéstaden | Car must be registered, booked at least 1 day ahead, 25 kr/h |
| Plats vid Järntorget (Göteborg) | Anna | Weekdays 08–17 only; rented from a BRF |
| Uppfart Västra Hamnen (Malmö) | Erik | Always open, 12 kr/h, max 90 kr/day; Malmö's only spot |
| BRF-plats i Haga (Göteborg) | Anna | Waiting for review (with a contract and the BRF's approval) |
| Kontorsparkering Gullbergsvass – Plats 1–4, Kontorsgarage Kungsholmen – Plats 1–2 | Kvarteret Fastigheter AB | Evenings, nights and weekends |

The seed also gives Oskar three bookings two days ahead on Garage Linnégatan – Plats 1–3,
each with a car still to register.

---

# Drivers

## 1. Driver: find, share, book, cancel

1. Log out. Open **Hitta parkering**. Search for "Göteborg".
   - The map fills the page and the list floats on the left.
   - The map credits show only as a small **(i)** in the corner; clicking it expands them.
2. Click **Carport nära Liseberg**, in the list or on its pin.
   - The spot opens in a panel on the right, still over the map (the URL gets `plats=`).
   - Signed out, there is no car field yet and the access instructions are hidden.
3. In the panel header, click **Kopiera länk**.
   - The button briefly reads "Kopierad!".
   - Paste the link into a new tab: it opens the spot's own page, with the chosen times if you set any.
   - On a phone the button reads **Dela** and opens the share sheet.
4. In the booking box, try **Nu** and the length buttons (**1 tim**, **2 tim** … **1 dygn**). Times move in 5-minute steps.
   - 3 hours shows Parkering 90 kr, Serviceavgift 9 kr, **Totalt 99 kr**.
5. Click **Logga in och boka** and log in as `forare@parklet.test`.
   - You come back to the same spot, over the map, with the times kept.
   - Now the car is asked for (**Välj bil**: ABC123 – Volvon, or **Annan bil…**).
6. Click **Fortsätt till betalning** and pay with the test card 4242 4242 4242 4242 (flow 18) ⚙.
   - "Klart! Din parkering är bokad och betald." and the booking with **Hitta och ta dig in** (the access instructions) and **Vägbeskrivning**.
   - **Bell:** "Bokningsbekräftelse: Carport nära Liseberg".
   - **E-post (admin log):** the booking confirmation with Plats/Tid/Bil/Totalt betalt/Boknings-id.
   - Erik gets "Ny bokning: Carport nära Liseberg" (bell + e-mail log).
7. Open **Mina bokningar**, open the booking and cancel it (**Avboka**, confirm the dialog).
   - "Bokningen är avbokad och pengarna återbetalas till ditt betalsätt inom några bankdagar."
   - The host (Erik) gets "Avbokning: Carport nära Liseberg" in the bell.

## 2. Booking rules: notice, duration, opening hours, old links

Log in as `forare@parklet.test`. The price box under the times says what's wrong before you submit.

1. **Minimum notice.** Open **Garage Linnégatan – Plats 1**.
   - The facts say "Boka senast 1 dygn innan start" and "Registrering av bil: Krävs av föreningen. Bilen registreras i föreningens parkeringsapp senast dagen innan."
   - Instead of **Nu** the button reads **Tidigast möjligt (…)**, and earlier times can't be picked.
   - Open the spot's link with `?from=` set to a time a few hours from now (`yyyy-mm-ddThh:mm`) and any `to=`: the box says "Platsen måste bokas minst 1 dygn i förväg." and submitting is refused with "… så att bilen hinner registreras."
2. **Minimum duration.** On **Carport nära Liseberg**, set the end 30 minutes after the start.
   - "Minsta bokningstid är 1 tim."; submitting gives "Minsta bokningstid för den här platsen är 1 tim."
3. **Outside opening hours.** Open **Plats vid Järntorget** (weekdays 08–17) and pick a Saturday 10:00–12:30.
   - "Platsen är inte tillgänglig hela den valda tiden."
   - Click **Fortsätt till betalning**: refused, and the Saturday times stay as you picked them (click it once more: still kept).
   - A weekday 09:00–11:00 then goes through to **Betala bokningen**. Leave without paying (flow 19 covers that).
4. **Billing.** On **Uppfart Västra Hamnen** (12 kr/h, max 90 kr/day):
   - **1 tim**: 12 kr + Serviceavgift 5 kr (the minimum fee) = 17 kr.
   - **1 dygn**: capped at 90 kr + 9 kr = 99 kr.
   - 1 h 5 min is billed as started quarters: "Parkering, 1 tim 15 min", 15 kr.
5. **Old links.** Open `/plats/<id>?from=…&to=…` with yesterday's times (copy a link from flow 1 and change the date).
   - The times are cleared: "Välj tid för att se priset.", no "inte tillgänglig".
   - A search link with past times finds the spot as if no time was given.
6. **A spot you can't book.** Log out and open `/plats/<id>` of **BRF-plats i Haga** (the id is in its admin page's URL).
   - "Platsen kan inte bokas just nu", with **Hitta parkering i närheten** leading to a search in Göteborg.
   - A made-up spot id gives "Platsen finns inte".

## 3. Two drivers, one slot

Two browsers (or a normal and a private window).

1. Browser A, as `forare@parklet.test`: search Malmö with a time two days ahead, open **Uppfart Västra Hamnen**, click **Fortsätt till betalning**. Stay on **Betala bokningen** without paying.
   - "Platsen är reserverad åt dig till kl. …" (15 minutes).
2. Browser B, as `anna@parklet.test`: the same search.
   - Malmö's only spot is taken: "Inga lediga platser i närheten – visar de närmaste." and Uppfart Västra Hamnen is not listed.
3. In B, open the spot's link directly.
   - **Redan bokad** lists the time; the box says "Platsen är redan bokad under en del av tiden."
   - Enter a car (e.g. XYZ987) and click **Fortsätt till betalning**: "Tyvärr, någon annan har redan bokat platsen under den här tiden. Välj en annan tid."
4. In A, pay (flow 18), then cancel the booking so the slot is free again.

## 4. Booking where the car must be registered

1. Log in as `forare@parklet.test`.
2. Book **Garage Linnégatan – Plats 1** (Göteborg) more than 24 h ahead, on another day than the demo bookings, and pay (flow 18).
   - Under **Bil**: "Föreningen kräver att bilen registreras. Uthyraren registrerar ditt registreringsnummer innan bokningen startar."
   - The booking shows **Registrering hos föreningen**: "Väntar på att uthyraren registrerar bilen", with the association's note.
   - The confirmation (bell + e-mail log) says the host registers the car.
3. Log in as `styrelsen@parklet.test`.
   - The bell shows a red number and "Registrera ABC123 – ny bokning av Garage Linnégatan – Plats 1".
   - Under **Att göra**: "Registrera en bil" (or "Registrera N bilar", counting the demo bookings).
   - The e-mail's button (e-mail log) is **Markera bilen som registrerad**.
4. Click the task.
   - The account page opens at **Bilar att registrera**.
   - Click **Markera som registrerad** next to ABC123. (From the booking itself the button reads **Markera ABC123 som registrerad**.)
5. Log in as the driver.
   - The bell shows "ABC123 är registrerad för Garage Linnégatan – Plats 1".
   - The booking shows "Registrerad …".
6. *(Optional, takes time)* Leave a booking unregistered.
   - 3 h before the start, the host gets "Påminnelse: registrera ABC123 före kl. …".
   - At the start, the driver gets "ABC123 är inte registrerad än – vänta med att parkera", the host gets "Bokningen har börjat – ABC123 är inte registrerad", and admins see "Bil ej registrerad vid start: …" in the bell (no e-mail).
   - The reminders run every 10 minutes, so allow for that.

## 5. Cancelling: in time, too late, by the host

As `forare@parklet.test`, on **Carport nära Liseberg** (free cancellation until 2 h before the start).

1. **In time.** Book a slot two days ahead. The booking says "Kostnadsfri avbokning fram till …".
   - **Avboka** asks "Vill du avboka? Det går inte att ångra."; confirm.
   - The page then says "Bokningen är avbokad … 99 kr återbetalas till ditt betalsätt inom några bankdagar." and **Betalt** shows "Återbetalt" (Stripe side: flow 20).
   - The booking moves to **Tidigare och avbokade** in **Mina bokningar**.
2. **Too late.** Book with **Nu** (it starts within 2 h).
   - No cancel button: "Avbokningsfristen gick ut … Har något hänt? Kontakta supporten."
3. **By the host.** Log in as `erik@parklet.test`, open that booking from **Bokningar** on the account page.
   - "Som uthyrare kan du avboka. Föraren får då hela beloppet tillbaka." and **Avboka som uthyrare**.
   - Oskar gets "Din bokning av Carport nära Liseberg är avbokad" with the full amount.
4. **Car not registered yet.** A Garage Linnégatan booking whose car isn't registered can always be cancelled for free, also after the deadline ("Bilen är inte registrerad än, så du kan avboka kostnadsfritt tills uthyraren har registrerat den.").

---

# Becoming a host

The way in: **Meny → Hyr ut → Uthyrning**. Without a host account it explains hosting and
**Kom igång** leads to **Bli uthyrare**. With one account it shows that account's dashboard, which ends with a
link **Skapa ett till uthyrarkonto**; with several it lists them, with the same link.

The account's checklist **Innan du kan ta emot bokningar** stays until BankID, payouts and one
approved spot are done.

## 6. Private person who owns the spot

Register a new account with a real address (📧 optional).

1. **Meny → Uthyrning → Kom igång**. Choose **Privatperson** and click **Skapa uthyrarkonto**.
   - The checklist: **Legitimera dig med BankID**, **Koppla konto för utbetalningar**, **Lägg upp en plats med underlag och få den godkänd**.
   - Bell, **Att göra**: "Legitimera dig med BankID", "Koppla utbetalningskonto".
2. Click **Legitimera dig**, then **Legitimera med BankID**, and identify with a test BankID.
   - Cancel once first: back on the page with "Legitimeringen avbröts. Försök igen när du är redo."
   - Then complete it: the BankID step is ✓. A household needs no review by Parklet.
3. Connect payouts (flow 21) ⚙.
4. Click **Lägg upp en plats**. Step 1, **Platsen**:
   - **Sök adress** and pick a result, or type **Adress** and **Ort** and click the map to place the pin.
   - **Rubrik**, **Typ av plats**, **Pris per timme (kr)**.
   - Under **Din rätt att hyra ut platsen** choose **Jag/vi äger platsen**.
   - Click **Spara och fortsätt till underlag**: "Platsen är sparad."
5. Step 2, **Underlag**: the only required slot is **Bevis på att du äger platsen**.
   - **Skicka in för granskning** first: "Det saknas underlag: bevis på att du äger platsen."
   - A file that isn't a PDF or image (e.g. a `.txt` renamed to `.pdf`): "Ladda upp en PDF eller en bild (JPG, PNG eller HEIC)."
   - A file just over 4 MB (say 4.2 MB): "Filen är större än 4 MB …".
   - Upload a PDF with **Välj fil…**: "<fil> är uppladdad." and a ✓.
6. Click **Skicka in för granskning**.
   - "Platsen är inskickad för granskning. Vi meddelar dig när de är godkända."
   - The badge reads **Granskas av Parklet**; steps 1 and 2 have a ✓; the documents are locked ("Underlagen är låsta medan Parklet granskar platsen …").
7. As admin, approve it (flow 13). Back as the host:
   - All three steps are ✓, "Platsen är godkänd och underlagen är låsta …".
   - When BankID and payouts are done too, the checklist is gone and the spot is in search.

## 7. Private person renting from a BRF, approval by e-mail link 📧

Use your own account, or a new account with a real address. Give **your own address** as the board's.

1. Open **Meny**.
   - It is grouped as **Parkera** / **Hyr ut** / **Administration** (Administration shows for admins only).
2. Under **Hyr ut**, open **Uthyrning** and choose **Lägg upp en plats**.
3. **Step 1, Platsen:**
   - Enter an address and place the pin on the map.
   - Enter a title and a price.
   - Under **Din rätt att hyra ut platsen** choose **Jag hyr platsen**, then **Bostadsrättsföreningen**.
   - Fill in **Föreningens namn** and **E-post till styrelsen** (your own address).
   - Click **Spara och fortsätt till underlag**.
4. **Step 2, Underlag:**
   - Click **Skicka in för granskning** first: it is refused because documents are missing.
   - Upload a PDF under **Hyresavtal för platsen**: you see "<fil> är uppladdad." and a ✓.
   - Under **Övriga dokument**, choose a type and upload a file.
   - Then click **Ta bort** on it and confirm: the message changes to "**<fil> är borttagen.**"
   - Under **Godkännande från föreningen**, click **Skicka godkännandeförfrågan**.
   - "Förfrågan är skickad. Du ser här när den är besvarad." The button now reads **Skicka förfrågan igen**.
5. 📧 In your inbox, check the e-mail "Godkännande för uthyrning av parkeringsplats – <adress>".
   - It has the logo, the details and the button **Granska och svara**.
   - Because the address has a Parklet account, your bell also has "Godkännande begärt: parkeringsplats på <adress>" (no second e-mail).
6. Open the link (logged out is fine). Answer as the board:
   - Fill in **Ditt namn** and **Din roll**. Submit without the **Jag intygar …** box: "Du behöver intyga att du får fatta beslutet."
   - Tick **Tillfälliga hyresgästers bilar måste registreras hos föreningen** and fill in **Hur registreras bilen? (visas för föraren)**.
   - Tick **Jag intygar …** and click **Godkänn uthyrning**: "Tack! Uthyrningen är godkänd. …"
   - Opening the link again: "Länken gäller inte längre".
7. As the host:
   - **Bell:** "<rubrik>: uthyrningen är godkänd", mentioning that the association requires registration.
   - The spot shows "Godkänt av <namn> (<roll>), …" and a ✓.
   - **Ändra uppgifter**: the registration box is ticked and locked ("Föreningen eller hyresvärden kräver det i sitt godkännande …"), and **Framförhållning** can't be set below one day.
8. Click **Skicka in för granskning**. Approve it as admin (flow 13) and check, as a driver, that the spot needs a day's notice and shows "Krävs av föreningen."

Variant: send the request, then **Skicka förfrågan igen**: the first e-mail's link now says "Länken gäller inte längre".

## 8. Private person renting from a landlord, uploaded approval

1. As a host, **Lägg upp en plats**; choose **Jag hyr platsen** and **Hyresvärd eller företag**.
   - The fields read **Hyresvärdens namn** and **E-post till hyresvärden**. Leave the e-mail empty.
2. In **Underlag**:
   - **Hyresavtal för platsen** ("Ditt avtal med hyresvärden om parkeringsplatsen."): upload a PDF.
   - **Godkännande från hyresvärden** says "Lägg till e-post till hyresvärden för att skicka en förfrågan."
   - Under **…eller ladda upp ett skriftligt godkännande** (i stället för förfrågan), upload a PDF: the approval gets its ✓.
3. Click **Skicka in för granskning**: accepted without any request sent.
4. As admin, open the spot.
   - **Hyresvärdens godkännande**: "Skriftligt godkännande uppladdat (se dokument)"; the document is listed as "Skriftligt godkännande av uthyrning".

## 9. The BRF or landlord says no 📧

1. As in flow 7, create a rented spot and send the request to your own address.
2. Open the link, fill in name, role and **Jag intygar …**, and click **Neka**.
   - "Tack för ditt svar. Platsen kommer inte att hyras ut via Parklet."
3. As the host:
   - **Bell:** "<rubrik>: uthyrningen nekades".
   - The spot says "Föreningen har nekat uthyrning av platsen."; there is no request button and no upload slot for a written approval.
   - **Skicka in för granskning**: "Hyresvärden/föreningen har nekat uthyrning av platsen. Den kan inte skickas in."
   - In admin, the spot's **Hyresvärdens godkännande** reads "Nekat av hyresvärden/föreningen".
4. Changing the association's e-mail under **Ändra uppgifter** starts over: the approval is missing again and a new request can be sent.

## 10. A BRF: several spots, shared documents, verification, co-administrator 📧

Log in with your own account (or `anna@parklet.test`, whose e-mails land in the log).

1. Open `/uthyrare/nytt` (or **Kom igång** without a host account) and choose **Bostadsrättsförening**.
2. Open **Uppgifter om organisationen (för förening och företag)**: **Organisationens namn**, **Organisationsnummer**, **Din roll**, and tick **Jag intygar …**.
   - Use a real BRF's number (look one up on allabolag.se). The number checks are in flow 11.
   - Click **Skapa uthyrarkonto**. The account takes the name registered at Bolagsverket, whatever you typed.
3. The checklist has **Verifiera organisationen**:
   - **Skicka in för verifiering** without documents: "Ladda upp ett registreringsbevis eller utdrag från Bolagsverket."
   - Upload one under **Typ av dokument** "Registreringsbevis / utdrag från Bolagsverket" with **Ladda upp**; try again: "Ladda upp ett styrelseprotokoll eller firmatecknarbevis …".
   - Upload a "Styrelseprotokoll" (or "Firmatecknarbevis") and click **Skicka in för verifiering**: "Tack! Vi granskar underlagen, oftast inom en arbetsdag." The step then reads "Underlagen granskas av Parklet."
   - Admins get "Ny organisation att verifiera: …" (bell + e-mail, button **Granska organisationen**).
4. Click **Lägg upp platser**. The right basis starts at **Jag/vi äger platsen**.
   - Set **Antal likadana platser** to 3 and save: "3 platser är sparade."
   - The account lists "<rubrik> – Plats 1", "– Plats 2", "– Plats 3".
5. Open Plats 1. Upload the ownership proof with **Gäller även de 2 andra platserna på samma adress** ticked (default).
   - Plats 2 and 3 have the document too.
6. Click **Skicka in för granskning** with **Skicka även in de 2 andra platserna på samma adress** ticked.
   - "3 platser är inskickade för granskning. …"
   - Admins get one notification: "Ny plats att granska: <rubrik> – Plats N (+2 till på samma adress)".
7. Invite a co-administrator under **Administratörer**: a real address in the field, **Bjud in**.
   - "Inbjudan skickad till …"; the list shows the address with "Inbjuden, gäller till …" (7 days).
   - 📧 The invite e-mail has the button **Acceptera inbjudan**.
   - Opened while logged in with another address: "Inbjudan skickades till … Logga in med den adressen för att acceptera."
   - Logged in with the invited address, **Acceptera inbjudan** opens the account; the invitee is listed as "Administratör".
   - As the co-administrator, the payout step says "Kontots ägare kopplar utbetalningskontot."
8. As admin, verify the organisation and approve the spots (flows 13 and 17). Until the organisation is verified, approved spots show "Kan inte bokas: kontot är inte godkänt".

## 11. A company checked against Bolagsverket

As any user, open `/uthyrare/nytt`, choose **Företag eller fastighetsägare** and fill in the organisation details.

1. **Invalid checksum**, e.g. `123456-7890`.
   - "Ange ett giltigt organisationsnummer (NNNNNN-NNNN)."
2. **Valid checksum, not registered**, e.g. `802000-5552`.
   - "Vi hittar ingen organisation med det numret hos Bolagsverket. Kontrollera numret."
3. **Deregistered**: the number of a deregistered company (allabolag.se marks them).
   - "<registered name> är avregistrerad hos Bolagsverket."
4. **Registered**, e.g. `556012-5790` (AB Volvo).
   - The account is created under the registered name, with "Org.nr 556012-5790", and the checklist asks for **Verifiera organisationen**.
   - In admin (**Uthyrare** → the account), the **Bolagsverket** row shows the registered name, form and "aktiv".
5. **Wrong kind**: create a **Bostadsrättsförening** with that same company number.
   - In admin: "⚠ formen stämmer inte med vald typ", and the list says "Registrerad som Aktiebolag".

If Bolagsverket can't be reached, the account is created under the typed name and admin sees
"Inte kontrollerat automatiskt – kontrollera manuellt".

## 12. Link-only spots, pausing, editing an approved spot

As `anna@parklet.test` (approved, bookable spots).

1. **Endast via länk.** Open **Plats vid Uppsala C → Ändra uppgifter**, choose **Bara de som har länken (t.ex. grannar eller kollegor)** and **Spara ändringar**.
   - The account shows the badge **Endast via länk**; the spot says "Platsen syns bara för dem som får länken till annonsen."
   - A search for Uppsala doesn't list it, but the spot's link (**Visa annonsen**) can be booked by Oskar.
   - Switch it back to **Alla – visas i sökningen och på kartan**.
2. **Pausa / Aktivera.** On the account page, click **Pausa** on a spot.
   - Badge **Pausad**; gone from search; its link says "Platsen kan inte bokas just nu"; in admin "Nej – Pausad av uthyraren".
   - Existing bookings stay. **Aktivera** brings it back.
3. **Editing an approved spot.** Change the address of an approved spot.
   - The form warns that a new address or basis needs a new review; after saving the spot is **Granskas av Parklet** and not bookable until approved again.
   - On Plats vid Järntorget (rented from a BRF), changing the association's e-mail sends the spot back to **Utkast – underlag saknas**: a new approval is needed.

---

# Admin review

## 13. Admin: notified, search, approve 📧

Log in as `johannes@jvo.se`, or as `admin@parklet.test` and use the e-mail log.

1. **Bell:**
   - The red number counts new events. It **disappears when you open the bell** and stays gone after you navigate.
   - "Att göra" lists "Granska N platser" / "Granska N uthyrarkonton" ("en plats", "ett uthyrarkonto" for one). When only tasks remain, the bell shows a yellow dot.
2. 📧 Check the inbox for "Ny plats att granska: …", with the button **Granska platsen**.
3. **Granskning:** the tabs are *Att granska · Platser · Uthyrare · E-post*.
   - **Att granska** lists **Uthyrarkonton (N)** (organisations, and households sent back for review) and **Platser (N)**.
4. **Platser:**
   - Search for part of a title, an address, an org. number or a spot ID.
   - Try the filters: Grund, Ort, Bokningsbar, Sortera.
   - Try the status chips; their counts should match the filters.
   - "Bokningsbar: Nej" tells you why: "Utbetalning saknas", "Kontot är inte verifierat" or "Pausad av uthyraren".
5. **Uthyrare:**
   - Search for a name, an org. number, or an owner's name or e-mail.
   - Filter on Typ, Utbetalning and the verification chips.
   - The owner's BankID status is shown ("BankID ✓" / "ej legitimerad"). "Platser" ("N av M") links to that host's spots.
6. Open the spot from flow 7.
   - It shows "Godkänt via länk av …" and the requirements with ✓.
   - Click **Godkänn**. You're back on **Att granska**; the host gets "Din plats … är godkänd" (bell + e-mail).
7. **E-post:** open any mail with **Visa som mejl** to see it rendered.

## 14. Reject with a reason, fix, resubmit

Uses **BRF-plats i Haga** (Anna, waiting for review).

1. As `anna@parklet.test`, open the spot.
   - "Granskas av Parklet", the documents are locked, and **Ta tillbaka från granskningen** is offered.
   - Click it: the badge is **Utkast – underlag saknas** and files can be changed again. Click **Skicka in för granskning** again.
2. As admin, open the spot. **Beslut** offers **Godkänn** and **Avslå / begär komplettering**.
   - **Avslå / begär komplettering** without a reason: "Skriv en motivering."
   - Write "Hyresavtalet saknar platsnummer." in **Motivering till uthyraren** and reject. You're back on **Att granska**.
3. As Anna:
   - **Bell:** "Din plats BRF-plats i Haga behöver kompletteras" with the reason; **Att göra**: "Komplettera BRF-plats i Haga".
   - The spot shows "Ej godkänd: Hyresavtalet saknar platsnummer." and the documents can be changed.
   - Upload another contract and click **Skicka in igen**.
4. As admin, approve it.
   - A rejected spot offers only **Godkänn**; an approved one only **Ta bort godkännandet**.

## 15. Remove a spot's approval

1. As admin, open an approved spot (e.g. BRF-plats i Haga after flow 14).
2. **Ta bort godkännandet** needs a reason ("Skriv en motivering."); write one and click it.
   - "Befintliga bokningar påverkas inte, men nya kan inte göras." Existing bookings stay.
   - Logged out, the spot's link says "Platsen kan inte bokas just nu" (admins can still preview it).
   - The host gets "Godkännandet av BRF-plats i Haga har tagits bort" and the spot says "Ej godkänd".
   - On an account whose only approved spot this was, the checklist comes back with the spot step open (Anna has other approved spots, so hers doesn't).
3. **Godkänn** makes it bookable again.

## 16. Remove a household's approval

Use a household with an approved, bookable spot (for example the account from flow 6).

1. As admin, open the host's account (**Uthyrare**), write a reason and click **Ta bort godkännandet**.
   - The host gets "Godkännandet av ditt uthyrarkonto har tagits bort".
   - Its approved and submitted spots go back to "Ej godkänd" ("Uthyrarkontot är inte godkänt längre …"), can't be booked and are gone from search.
2. As the host, open **Uthyrning**.
   - The checklist is back: **Legitimera dig med BankID** is open, **Parklet godkänner kontot** shows "Ej godkänt: <reason>", and the spot step is open.
   - **Att göra**: "Legitimera dig igen så att kontot granskas på nytt".
3. Click **Legitimera dig igen**.
   - "Ditt uthyrarkonto är inte godkänt längre. Legitimera dig igen, så granskar Parklet kontot på nytt."
   - Identify with BankID: "Kontot granskas av Parklet, oftast inom en arbetsdag." The account is **not** approved by BankID alone.
   - Admins get "Privat uthyrare att granska igen: …" (button **Granska kontot**).
4. As admin, approve the account. The spot is still not bookable.
5. As the host, send the spot in again (**Skicka in igen**); as admin, approve it (a rejected spot can also be approved directly). Only now is it bookable and the checklist gone.

## 17. Organisation: reject, verify, remove, verify again

Use the BRF from flow 10 (sent for verification).

1. As admin, open it from **Att granska** (or **Uthyrare**).
   - Check what Bolagsverket said, the role and the documents.
   - **Avslå / begär komplettering** with a reason: the members get "Er organisation behöver kompletteras"; the dashboard shows "Ej godkänd: <reason>" with the upload again; **Att göra**: "Skicka in underlag för att verifiera …".
2. As the host, click **Skicka in för verifiering** again (add a document if you like).
3. As admin, click **Godkänn**. The members get "Er organisation är verifierad på Parklet". The status reads "Verifierad …" and the only decision left is **Ta bort godkännandet**.
4. **Ta bort godkännandet** with a reason.
   - "Ej godkänd (<reason>). Väntar på att uthyraren kompletterar." and only **Godkänn**.
   - The members get "Verifieringen av er organisation har tagits bort"; its spots go back to "Ej godkänd".
5. The host sends the organisation in again; admin approves it, then each spot again (or the host sends the spots in again first).

---

# Payments (Stripe test mode) ⚙

Everything here runs against Stripe **test mode**: no real money. Card details for every test
card: any future expiry date (e.g. 12/34), any CVC (e.g. 123), any postal code.

## 18. Paying: success, 3-D Secure, declined ⚙

As `forare@parklet.test`, book **Carport nära Liseberg** for 3 hours (99 kr) and click **Fortsätt till betalning**.

1. **Betala bokningen** shows Parkering 90 kr, Serviceavgift (inkl. moms) 9 kr, Att betala 99 kr.
   - Click ⚙ *[pay button]*: ⚙ *[Stripe's payment form: hosted Checkout page or embedded form]* opens, for 99 kr.
2. **Success:** pay with **4242 4242 4242 4242**.
   - Back on Parklet: "Klart! Din parkering är bokad och betald. …" ⚙ *[any "waiting for the payment to be confirmed" state shown before the webhook arrives]*.
   - Bell and e-mail as in flow 1.
3. **3-D Secure:** a new booking, card **4000 0027 6000 3184**.
   - Stripe's test authentication page opens. Complete it: the booking is confirmed.
   - Again with the same card, but fail the authentication: ⚙ *[the message]*; no booking, and the slot is free again once the hold ends (flow 19).
4. **Declined:** card **4000 0000 0000 9995** (insufficient funds), then **4000 0000 0000 0002** (generic decline).
   - Stripe shows the decline in the form ⚙ *[wording]*; you can try another card while the hold lasts.
   - Nothing is booked, nothing is charged.
5. Paying for someone else's booking: open another driver's `/betala/<id>`: "Bokningen hittades inte".

## 19. Leaving the payment: the hold expires ⚙

1. Book, reach ⚙ *[the Stripe payment form]*, and close the tab without paying.
   - Before that, **Betala bokningen** says "Platsen är reserverad åt dig till kl. …" (15 minutes).
2. Within the 15 minutes, a second driver can't book the slot (flow 3).
3. After 15 minutes, open `/betala/<id>` again (or **Slutför betalningen** on the booking).
   - "Reservationen har gått ut. Ingen betalning har dragits." with **Boka igen**.
   - The second driver can now book the slot.
4. ⚙ *[What Stripe does with the unpaid session: expired Checkout session / cancelled PaymentIntent; check it in the dashboard.]*
5. ⚙ *[A payment completed just after the hold expired: "Reservationen hann gå ut innan betalningen genomfördes. Ingen betalning har dragits. Boka igen." — check whether the charge is refunded automatically.]*

## 20. Refunds ⚙

1. Cancel within the free window (flow 5, step 1).
   - Parklet: "… återbetalas till ditt betalsätt inom några bankdagar." and "Återbetalt".
   - Stripe: the payment shows a full refund of 99 kr ⚙ *[and that the transfer to the host and the application fee are reversed]*.
2. Cancel as the host (flow 5, step 3): the same full refund.
3. Too late (flow 5, step 2): no refund, no cancel button.
4. ⚙ *[If the refund fails, the booking stays confirmed (or, if the slot was rebooked, admins get "Återbetalning misslyckades: …" in the bell). Find a way to provoke this in test mode, or skip.]*

## 21. Host connects payouts with Stripe ⚙

Log in as `ny@parklet.test` (Maja: no BankID, no payouts).

1. **What blocks bookings:**
   - The checklist step **Koppla konto för utbetalningar** says "Legitimera dig först." until BankID is done.
   - An approved spot without payouts shows "Kan inte bokas: utbetalningskonto saknas" on the account page, isn't in search, and admin shows "Nej – Utbetalning saknas".
   - Only the account's owner can connect payouts; a co-administrator sees "Kontots ägare kopplar utbetalningskontot."
2. Identify with BankID, then click ⚙ *[connect payouts button]*.
   - Stripe's onboarding opens ⚙ *[Express onboarding]*. Fill it in with Stripe's test data: test phone number and SMS code **000 000**, test IBAN **SE35 5000 0000 0549 1000 0003**, and the test values Stripe offers for identity.
3. Leave the onboarding halfway and come back.
   - ⚙ *[The step is not done; the button to continue reads …]*.
4. Finish the onboarding.
   - Back on Parklet: ⚙ *["Utbetalningskontot är kopplat." or a pending state until Stripe confirms]*; the step gets its ✓ and "Koppla utbetalningskonto" leaves **Att göra**.
   - In admin, **Uthyrare** shows **Utbetalning: Kopplad**.
   - With an approved spot, it is now bookable.

## 22. Checking it in the Stripe dashboard ⚙

Open the Stripe dashboard in **test mode** after flows 18–21.

1. **Payments:** the 99 kr payment from flow 18, step 2.
   - ⚙ *[Description/metadata with the booking id]*.
   - Application fee: **9 kr** (Parklet's service fee); transfer of **90 kr** to the host's connected account (Erik).
   - The declined and failed-3-D Secure attempts show as failed, with the reason.
2. **Connect → Connected accounts:** Maja's account from flow 21, with charges and payouts enabled.
3. **Refunds:** the cancelled bookings from flow 20 ⚙ *[with the transfer reversed and the application fee refunded]*.
4. **Developers → Webhooks:** `payment_intent.succeeded` (and ⚙ *[account.updated / other events]*) delivered with status 200.
5. The minimum fee: a 1-hour booking on **Uppfart Västra Hamnen** (12 kr) has an application fee of **5 kr**.

---

# Everything else

## 23. Password reset 📧

1. Log out and click **Glömt lösenordet?** on the login page.
2. Enter your real address and click **Skicka länk**.
   - "Om det finns ett konto med den adressen har vi skickat en länk … Länken gäller i en timme." (the same for unknown addresses).
3. The e-mail "Välj ett nytt lösenord för Parklet" has the button **Välj nytt lösenord**.
   - Enter **Nytt lösenord** (at least 10 characters) and **Spara och logga in**: you're logged in.
   - The old password no longer works ("Fel e-postadress eller lösenord."), the new one does.
   - The same link a second time: "Länken är ogiltig eller har gått ut. Begär en ny."

## 24. Forms keep what was typed

After an error, nothing you entered may jump back to its default.

1. **Spot form:** fill in the title, **Jag hyr platsen**, **Bostadsrättsföreningen**, the association's name, tick the registration box with a note, a price, but no address or pin. Click **Spara och fortsätt till underlag**.
   - By the button: "N fält behöver rättas, se markeringarna ovan."; the first bad field is focused and in view.
   - Every choice is kept. Switch to **Hyresvärd eller företag** and save again: that choice is kept too.
2. **New host account:** **Bostadsrättsförening** with a name and **Jag intygar …**, no number. The choice, the name and the box stay.
3. **Register** with an address that already has an account: "Det finns redan ett konto med den e-postadressen. …", with name, e-mail and the terms box kept.
4. **Booking:** flow 2, step 3 (the times stay after a refusal).
5. **Mina fordon:** "inte ett regnr!" is refused and stays in the field; "KVR 12A" is saved as "KVR12A är sparad." and the field empties. **Ta bort** removes it.

## 25. The bell, per role

The bell appears for hosts and admins, and for drivers once they have a notification.

1. **Driver** (`forare@parklet.test`): booking confirmations, "… är registrerad för …", cancellations by the host. No **Att göra**.
2. **New host** (`ny@parklet.test`): **Att göra** "Legitimera dig med BankID", "Koppla utbetalningskonto", and "Slutför och skicka in <rubrik>" for a draft spot. Each disappears once done.
3. **Host with several accounts** (`erik@parklet.test`): tasks carry the account's name in brackets.
4. **BRF board** (`styrelsen@parklet.test`): "Registrera en bil" / "Registrera N bilar"; "Godkännande begärt: …" when a member asks the board's address.
5. **Admin:** "Granska N platser", "Granska N uthyrarkonton", and events such as "Ny plats att granska: …".
6. For all: the red number clears when the bell opens; a click on an item opens its page and closes the bell; Escape closes it.

## 26. Access rules

1. **Admin pages** (`/admin`, `/admin/epost`, `/admin/platser`, `/admin/konton`, a spot or account in admin): logged out you are sent to the login; as a driver or host you're sent away.
2. **Another host's account:** as Anna, open a link to Kvarteret Fastigheter AB's account (`/uthyrare/<id>`).
   - "Du har inte tillgång till sidan", "Du är inloggad som anna@parklet.test." and nothing of the account.
   - **Logga in med ett annat konto** brings you back to the same page after logging in.
   - As admin the same link offers **Öppna kontot i administrationen** (for a spot: **Öppna platsen i administrationen**).
3. **Another driver's booking:** as Anna, open one of Oskar's `/bokning/<id>` or `/betala/<id>`: "Bokningen hittades inte".
4. **Documents:** copy the link of a document of BRF-plats i Haga (from Anna's spot page) and open it:
   - logged out: refused (401); as Erik or Oskar: not found (404); as Anna or an admin: the PDF.
5. A spot that isn't bookable is shown as a preview to its own host and to admins only ("Förhandsvisning: platsen är inte bokningsbar ännu …"); everyone else gets "Platsen kan inte bokas just nu".
6. **Switching user on one device:** log in as `ny@parklet.test`, open **Uthyrning**, log out from the menu, log in as `anna@parklet.test` and open **Uthyrning** again: Anna's own account opens, not Maja's.

## 27. Phone checks

On a phone (or the browser's phone view), around 375 px wide.

1. No page scrolls sideways: home, **Hitta parkering**, a spot, **Betala bokningen**, a booking, the host account, the spot form, admin lists.
2. **Hitta parkering:** the results start as a collapsed sheet over the map; **Visa lista** opens it, **Visa karta** closes it. A spot opens over the map; × closes it.
3. In the spot panel the share button reads **Dela** and opens the share sheet.
4. **Meny** covers the screen; × (**Stäng menyn**) closes it.
5. The bell's panel fits the screen.
6. The time selects and length buttons are easy to hit; the booking box stays usable with the keyboard open.
7. Uploading a document offers the camera or the photo library; a photo just over 4 MB is refused with "Filen är större än 4 MB …".
8. Admin lists turn into stacked rows.
9. ⚙ The Stripe payment form and onboarding fit the screen, and 3-D Secure works there.

## 28. Daily summary 📧

This one can't be triggered from the UI.

- It is sent every morning at 06:00 UTC (08:00 Swedish summer time) to all admins, but only when something is waiting or happened in the last 24 hours.
- Check `johannes@jvo.se` the next morning for "Parklet: N att granska" or "Parklet: dagens sammanfattning", with the button **Öppna granskningen**.
