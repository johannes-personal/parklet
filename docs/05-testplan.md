# Manual test plan: main flows

Run against https://parklet-rebuild.vercel.app after the latest deploy.

Markers:
- 📧 the flow sends a real e-mail: use an address you can read.

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
- **Payments (Stripe test mode)**
  18. [Paying: success, 3-D Secure, declined](#18-paying-success-3-d-secure-declined)
  19. [Leaving the payment: the reservation runs out](#19-leaving-the-payment-the-reservation-runs-out)
  20. [Refunds](#20-refunds)
  21. [Host connects payouts with Stripe](#21-host-connects-payouts-with-stripe)
  22. [Checking it in the Stripe dashboard](#22-checking-it-in-the-stripe-dashboard)
- **Everything else**
  23. [Password reset](#23-password-reset-)
  24. [Forms keep what was typed](#24-forms-keep-what-was-typed)
  25. [The bell, per role](#25-the-bell-per-role)
  26. [Access rules](#26-access-rules)
  27. [Phone checks](#27-phone-checks)
  28. [Daily summary](#28-daily-summary-)
  29. [Your account: details, Mina fordon, deleting it](#29-your-account-details-mina-fordon-deleting-it)
  30. [Mina sidor: filtering your bookings](#30-mina-sidor-filtering-your-bookings)
  31. [Admin: bookings](#31-admin-bookings)
  32. [Admin: the e-mail log](#32-admin-the-e-mail-log)
  33. [Full names](#33-full-names)
  34. [The host's pages](#34-the-hosts-pages)
  35. [Administrators: invite, correct, take back, remove, hand over](#35-administrators-invite-correct-take-back-remove-hand-over-)
  36. [Deleting a parking space, an organisation, or hosting altogether](#36-deleting-a-parking-space-an-organisation-or-hosting-altogether)
  37. [Search filters](#37-search-filters)
  38. [Coming back from Stripe, and the header after switching account](#38-coming-back-from-stripe-and-the-header-after-switching-account)

---

## Before you start: Återställ testdata

Reset first, so every flow starts from the state described below.

1. Log in as `johannes@jvo.se` (or `admin@parklet.test`) and open the admin tab **Testdata** (`/admin/testdata`).
   - It lists the demo logins and their password.
2. Click **Återställ testdata** and confirm.
   - A green message says what was removed and created. You are still logged in (other devices are logged out).
   - The demo accounts in the table below are back to their starting state, with their bookings and documents.
   - Accounts with real addresses that were created during testing (for example `snyggast@jvo.se`) are **deleted**, so the same address can register again.
   - Your own admin login (`johannes@jvo.se`) is kept, with its password and BankID; anything it created (host accounts, spots, bookings, cars) is removed.
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
- Payments: Stripe test mode when it is switched on (flows 18–22); otherwise the mock button **Betala … (testläge)** confirms at once.
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
   - The spots within 3 km come first; when there are fewer than ten, **Andra parkeringsplatser** lists the nearest ones further away ("Längre bort än 3 km, närmast först"), so at least ten are shown when there are that many. Search for "Malmö": Uppfart Västra Hamnen first, the other Malmö spots under **Andra parkeringsplatser**.
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
6. Click **Fortsätt till betalning** and pay: with Stripe on, with the test card 4242 4242 4242 4242 (flow 18); otherwise with **Betala … (testläge)**.
   - "Klart! Din parkering är bokad och betald." and the booking with **Hitta och ta dig in** (the access instructions) and **Vägbeskrivning**; **Bokad** says when it was booked.
   - **Bell:** "Bokningsbekräftelse: Carport nära Liseberg".
   - **E-post (admin log):** the booking confirmation with Plats/Tid/Bil/Bokad/Totalt betalt/Boknings-id. Under **Visa som mejl**, **Visa bokningen** opens the booking in a new tab.
   - Erik gets "Ny bokning: Carport nära Liseberg" (bell + e-mail log).
7. Open **Mina sidor**, open the booking and cancel it (**Avboka**, confirm the dialog).
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
5. **Old links.** Open `/plats/<id>?from=…&to=…` with yesterday's times (the id is in the spot's admin page's URL).
   - It opens the search map around the spot, with the spot in the panel (`/sok?…&plats=<id>`).
   - The times are cleared: "Välj tid för att se priset.", no "inte tillgänglig".
   - A search link with past times finds the spot as if no time was given.
6. **A spot you can't book.** Log out and open `/plats/<id>` of **BRF-plats i Haga** (the id is in its admin page's URL).
   - The map of Göteborg around it, with "Platsen kan inte bokas just nu" in the panel and the bookable spots nearby in the list.
   - A made-up spot id gives "Platsen finns inte".

## 3. Two drivers, one slot

Two browsers (or a normal and a private window).

1. Browser A, as `forare@parklet.test`: search Malmö with a time two days ahead, open **Uppfart Västra Hamnen**, click **Fortsätt till betalning**. Stay on **Betala bokningen** without paying.
   - "Platsen är reserverad åt dig till kl. …" (15 minutes).
2. Browser B, as `anna@parklet.test`: the same search.
   - Malmö's only spot is taken: "Inga lediga parkeringsplatser inom 3 km – här är de närmaste." under **Andra parkeringsplatser** and Uppfart Västra Hamnen is not listed.
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
   - The account's **Granska** tab opens at **Bilar att registrera**, grouped per parking space.
   - Click **Markera som registrerad** next to ABC123. (From the booking itself the button reads **Markera ABC123 som registrerad**.)
5. Log in as the driver.
   - The bell shows "ABC123 är registrerad för Garage Linnégatan – Plats 1".
   - The booking shows "Registrerad …".
6. **Next time, no wait.** Book the same space again with ABC123.
   - Under **Bil**: "ABC123 är redan registrerad hos föreningen, så du kan parkera direkt när bokningen börjar."
   - The booking is registered from the start; the confirmation says so, and the BRF gets a plain "Ny bokning" ("ABC123 är redan registrerad för platsen") with nothing to do.
   - Book it with another car: that one waits for the host as before.
7. **The list of registered cars.** As `styrelsen@parklet.test`, open the space (**Parkeringsplatser** tab → the space) and scroll to **Registrerade bilar**.
   - ABC123 is listed with when and by whom it was registered.
   - **Lägg till bil** with a plate: "XXX är registrerad för platsen." A booking already waiting with that car is registered at once, and its driver told.
   - **Ta bort** takes a car off the list; bookings already registered stay registered.
8. *(Optional, takes time)* Leave a booking unregistered.
   - 3 h before the start, the host gets "Påminnelse: registrera ABC123 före kl. …".
   - At the start, the driver gets "ABC123 är inte registrerad än – vänta med att parkera", the host gets "Bokningen har börjat – ABC123 är inte registrerad", and admins see "Bil ej registrerad vid start: …" in the bell (no e-mail).
   - The reminders run every 10 minutes, so allow for that.

## 5. Cancelling: in time, too late, by the host

As `forare@parklet.test`, on **Carport nära Liseberg** (free cancellation until 2 h before the start).

1. **In time.** Book a slot two days ahead. The booking says "Kostnadsfri avbokning fram till …".
   - **Avboka** asks "Vill du avboka? Det går inte att ångra."; confirm.
   - The page then says "Bokningen är avbokad … 99 kr återbetalas till ditt betalsätt inom några bankdagar." and **Betalt** shows "Återbetalt" (Stripe side: flow 20).
   - The booking moves to **Tidigare och avbokade** on **Mina sidor**.
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
3. Connect payouts (flow 21).
4. Click **Lägg upp en plats**. Step 1, **Platsen**:
   - **Sök adress** and pick a result: the field shows the whole address with postnummer and postort, and **Adress** gets the street (also for a named place such as "Malmö Arena"). Or type **Adress** and **Ort** and click the map to place the pin.
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
4. Click **Lägg upp parkeringsplatser**. The right basis starts at **Jag/vi äger platsen**.
   - Set **Antal likadana parkeringsplatser** to 3 and save: "3 parkeringsplatser är sparade."
   - The account lists "<rubrik> – Plats 1", "– Plats 2", "– Plats 3".
5. Open Plats 1. Upload the ownership proof with **Gäller även de 2 andra parkeringsplatserna på samma adress** ticked (default).
   - Plats 2 and 3 have the document too.
6. Click **Skicka in för granskning** with **Skicka även in de 2 andra parkeringsplatserna på samma adress** ticked.
   - "3 parkeringsplatser är inskickade för granskning. …"
   - Admins get one notification: "Ny plats att granska: <rubrik> – Plats N (+2 till på samma adress)".
7. Invite a co-administrator under the **Administratörer** tab: a real address in the field, **Bjud in**.
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
2. **Pausa / Aktivera.** Open an approved spot (**Parkeringsplatser** tab) and click **Pausa**.
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
   - "Att göra" lists "Granska N parkeringsplatser" / "Granska N uthyrarkonton" ("en parkeringsplats", "ett uthyrarkonto" for one). When only tasks remain, the bell shows a yellow dot.
2. 📧 Check the inbox for "Ny plats att granska: …", with the button **Granska platsen**.
3. **Granskning:** the tabs are *Att granska · Parkeringsplatser · Uthyrare · Bokningar · E-post* (and *Testdata* in the demo).
   - **Att granska** lists **Uthyrarkonton (N)** (organisations, and households sent back for review) and **Parkeringsplatser (N)**.
4. **Parkeringsplatser:**
   - Search for part of a title, an address, an org. number or a spot ID.
   - Try the filters: Grund, Ort, Bokningsbar, Sortera.
   - Try the status chips; their counts should match the filters.
   - "Bokningsbar: Nej" tells you why: "Utbetalning saknas", "Kontot är inte verifierat" or "Pausad av uthyraren".
5. **Uthyrare:**
   - Search for a name, an org. number, or an owner's name or e-mail.
   - Filter on Typ, Utbetalning and the verification chips.
   - The owner's BankID status is shown ("BankID ✓" / "ej legitimerad"). "Parkeringsplatser" ("N av M") links to that host's spots.
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

# Payments (Stripe test mode)

Everything here runs against Stripe **test mode**: no real money. Card details for every test
card: any future expiry date (e.g. 12/34), any CVC (e.g. 123), any postal code. Stripe's own
test values are listed on its "Testing" page in the docs; if a value below is refused, use
the one listed there.

These flows need Stripe switched on in the deployment (`PAYMENT_PROVIDER=stripe` and the
keys; see the README, "Payments"). Without it the payment page shows the mock button
**Betala … (testläge)**, which confirms at once, and flows 18–22 don't apply. With Stripe on,
the demo hosts share one finished test account if `STRIPE_TEST_CONNECTED_ACCOUNT` is set (so
their spots can be paid for straight after **Återställ testdata**); otherwise they start
without payouts and each connects through flow 21 first.

## 18. Paying: success, 3-D Secure, declined

As `forare@parklet.test`, book **Carport nära Liseberg** for 3 hours (99 kr) and click **Fortsätt till betalning**.

1. **Betala bokningen** shows Parkering 90 kr, Serviceavgift (inkl. moms) 9 kr, Att betala 99 kr, "Platsen är reserverad åt dig till kl. …" and "Du betalar på Stripes säkra betalsida …".
   - Click **Betala 99 kr (testläge)**: Stripe's payment page (Stripe Checkout) opens, in Swedish, for 99 kr, with "Parkering: Carport nära Liseberg" and "Serviceavgift (inkl. moms)".
   - The reservation time on Parklet's page moves to about 31 minutes from now: the slot stays held for as long as Stripe's page can take the payment.
2. **Success:** pay with **4242 4242 4242 4242**.
   - Back on Parklet: "Klart! Din parkering är bokad och betald. Ett kvitto har skickats till din e-post."
   - Bell and e-mail as in flow 1.
3. **3-D Secure:** a new booking, card **4000 0027 6000 3184**.
   - Stripe's test authentication opens. Complete it: the booking is confirmed as in step 2.
   - Again with the same card, but fail the authentication: Stripe shows the error on its page and you stay there; nothing is booked or charged.
4. **Declined:** card **4000 0000 0000 9995** (insufficient funds), then **4000 0000 0000 0002** (generic decline).
   - Stripe shows the decline on its page; you can try another card while the reservation lasts. Finish with 4242: the booking is confirmed.
5. **Back without paying:** on Stripe's page click **←** (back to Parklet).
   - "Betalningen avbröts. Ingen betalning har dragits, och platsen är fortfarande reserverad åt dig."
   - **Betala …** again reopens the same Stripe page (the reservation is not extended again).
6. Paying for someone else's booking: open another driver's `/betala/<id>`: "Bokningen hittades inte".

## 19. Leaving the payment: the reservation runs out

1. Book, click **Fortsätt till betalning** and wait on **Betala bokningen** without clicking pay.
   - "Platsen är reserverad åt dig till kl. …" (15 minutes).
   - After 15 minutes, reload: "Reservationen har gått ut. Ingen betalning har dragits." with **Boka igen**. The booking shows **Ej genomförd** and the slot is bookable again.
2. Book again, open Stripe's page with **Betala …**, and close the tab without paying.
   - Within the reservation (about 31 minutes), a second driver can't book the slot (flow 3).
   - Afterwards the booking shows **Ej genomförd** and the second driver can book.
   - Stripe dashboard: the Checkout Session is **Expired**; no payment.
3. Cancelling a booking that isn't paid yet also closes its Stripe page: paying there afterwards is refused by Stripe.
4. A payment that arrives too late (it can't be provoked by hand with a card; covered by the automated tests): if the slot is still free the booking is kept; if someone else has booked it, the driver gets "Betalningen för … återbetalas" and the full amount back.

## 20. Refunds

1. Cancel within the free window (flow 5, step 1).
   - Parklet: "… återbetalas till ditt betalsätt inom några bankdagar." and "Återbetalt".
   - Stripe: the payment shows a full refund of 99 kr; the transfer to the host is reversed and Parklet's application fee is refunded.
2. Cancel as the host (flow 5, step 3): the same full refund.
3. Too late (flow 5, step 2): no refund, no cancel button.
4. Refund a paid booking in Stripe's dashboard instead (**Payments → the payment → Refund**, the full amount): the booking in Parklet becomes cancelled and refunded.
5. If a refund fails at Stripe, admins get "Återbetalning misslyckades hos Stripe" in the bell (this can't be provoked by hand; covered by the automated tests).

## 21. Host connects payouts with Stripe

Log in as `ny@parklet.test` (Maja: no BankID, no payouts).

1. **What blocks bookings:**
   - The checklist step **Koppla konto för utbetalningar** says "Legitimera dig först." until BankID is done.
   - An approved spot without payouts shows "Kan inte bokas: utbetalningskonto saknas" on the account page, isn't in search, and admin shows "Nej – Utbetalning saknas".
   - Only the account's owner can connect payouts; a co-administrator sees "Kontots ägare kopplar utbetalningskontot."
2. Identify with BankID, then click **Koppla utbetalningskonto**.
   - Stripe's registration opens (an Express account), with Maja's e-mail and name filled in.
   - Stripe's test data: phone **000 000 0000** with SMS code **000000**; date of birth **1901-01-01**; address line **address_full_match**; ID number **000000000** where asked; **Use test document** if an ID document is asked for; bank account (IBAN) **SE35 5000 0000 0549 1000 0003**.
3. Leave the registration halfway (close it, or **←** back to Parklet).
   - "Registreringen hos Stripe är inte klar. Fortsätt där du slutade när du vill." The step reads "Registreringen hos Stripe är påbörjad men inte klar." with **Fortsätt hos Stripe**.
4. Finish the registration.
   - Back on Parklet: "Utbetalningskontot är kopplat." and the step gets its ✓, or "Tack! Stripe kontrollerar uppgifterna. …" until Stripe is done; then the bell says "Utbetalningskontot är kopplat".
   - If Stripe wants more: "Stripe behöver fler uppgifter innan utbetalningar kan göras." with **Komplettera hos Stripe**, and the bell says "Stripe behöver fler uppgifter för utbetalningar".
   - In admin, **Uthyrare** shows **Utbetalning: Kopplad**. With an approved spot, it is now bookable.
5. On the account page, the payouts card has **Öppna Stripe**: it opens Maja's Stripe Express dashboard (balance and payouts).

## 22. Checking it in the Stripe dashboard

Open the Stripe dashboard in **test mode** after flows 18–21.

1. **Payments:** the 99 kr payment from flow 18, step 2.
   - Description "Parklet: Carport nära Liseberg, <time>, <car>"; metadata `booking_id`.
   - Application fee: **9 kr** (Parklet's service fee); transfer of **90 kr** to the host's connected account.
   - The declined and failed-3-D Secure attempts show as failed, with the reason.
2. **Connect → Accounts:** one Express account per host that connected (Maja's from flow 21), with its status (Enabled, Pending or Restricted). **Connect → Collected fees** lists the application fees.
3. **Refunds:** the cancelled bookings from flow 20, with the transfer reversed and the application fee refunded.
4. **Developers → Webhooks:** deliveries with status 200 for `checkout.session.completed`, `checkout.session.expired` and `charge.refunded` (endpoint for your account) and `account.updated` (endpoint for connected accounts).
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

Everyone who is logged in has a bell, straight after logging in or registering, also with nothing in it yet ("Inget nytt än."); it updates itself without a reload.

1. **Driver** (`forare@parklet.test`): booking confirmations, "… är registrerad för …", cancellations by the host. No **Att göra**.
2. **New host** (`ny@parklet.test`): **Att göra** "Legitimera dig med BankID", "Koppla utbetalningskonto", and "Slutför och skicka in <rubrik>" for a draft spot. Each disappears once done.
3. **Host with several accounts** (`erik@parklet.test`): tasks carry the account's name in brackets.
4. **BRF board** (`styrelsen@parklet.test`): "Registrera en bil" / "Registrera N bilar"; "Godkännande begärt: …" when a member asks the board's address.
5. **Admin:** "Granska N parkeringsplatser", "Granska N uthyrarkonton", and events such as "Ny plats att granska: …".
6. For all: the red number clears when the bell opens; a click on an item opens its page and closes the bell; Escape closes it.

## 26. Access rules

1. **Admin pages** (`/admin`, `/admin/platser`, `/admin/konton`, `/admin/bokningar`, `/admin/epost`, a spot, account, booking or mail in admin): logged out you are sent to the login; as a driver or host you're sent away.
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
9. Stripe's payment page and registration fit the screen, and 3-D Secure works there.

## 28. Daily summary 📧

This one can't be triggered from the UI.

- It is sent every morning at 06:00 UTC (08:00 Swedish summer time) to all admins, but only when something is waiting or happened in the last 24 hours.
- Check `johannes@jvo.se` the next morning for "Parklet: N att granska" or "Parklet: dagens sammanfattning", with the button **Öppna granskningen**.

## 29. Your account: details, Mina fordon, deleting it

1. As `forare@parklet.test`, open **Mina sidor** (the name in the header): **Ditt konto** comes first, the bookings under it.
   - Namn, E-post, **Kontotyp: Förare**, BankID "Inte legitimerad (behövs bara för att hyra ut)".
   - **Mina fordon** with what it is for, and **Bli uthyrare**.
2. As `erik@parklet.test`: **Kontotyp: Förare och uthyrare**, with his two host accounts (Privatperson, Företag) as links, and **Skapa ett till uthyrarkonto** with why an account can't change type.
3. Register a new account (a real address works too) and open **Ta bort kontot** under **Ditt konto**.
   - Without the box ticked: "Bekräfta att du vill ta bort kontot."; with a wrong password: "Fel lösenord.".
   - With both: "Ditt konto är borttaget", logged out; logging in with the old details fails, and the address can register again.
4. Refusals: with a coming booking ("Du har kommande bokningar …"), as a host with a coming booking on a spot, as the owner of an account with co-administrators, and as an admin.
5. A host's deleted account: its spots are removed, or kept out of sight when they were booked (admin: **Parkeringsplatser**) and its documents gone; bookings already made stay, without the person's name.

## 30. Mina sidor: filtering your bookings

1. As `forare@parklet.test`, open **Mina sidor**. The old address `/mina-bokningar` leads there too.
2. **Visa: Kommande** (applies at once): "N bokningar", none of them **Avbokad**. **Avbokade** shows only cancelled ones, **Tidigare** the ones that are over.
3. **Från** and **Till**, then **Filtrera**: the bookings on some day in that range. A range years ahead gives "Inga bokningar matchar."
4. **Rensa** brings back **Kommande** and **Tidigare och avbokade**.

## 31. Admin: bookings

1. As admin, open **Bokningar** in the admin tabs (or **Meny → Administration → Bokningar**).
2. The chips count per status (**Alla**, **Bekräftad**, **Väntar på betalning**, **Avbokad**, **Ej genomförd**); each count ignores the status filter, so it shows what the chip would give.
3. **Search** finds a booking by spot, host, the driver's name or e-mail, the plate (`abc 123` works), the first characters of the booking id, or a Stripe payment or session id.
4. **Tid** (Kommande / Pågående / Passerade), **Från–Till** (bookings that overlap the range), **Betalning** (Ej betald / Betald / Återbetald), **Ort** and **Sortera** (Senast bokad, Starttid, Högst belopp) combine with the search.
5. A row opens the booking: spot and host account (links to their admin pages), the driver's full name and e-mail, the car and its registration, the amount split into the host's share and the service fee, the payment's status and Stripe ids, and when it was created, booked and cancelled (and by whom).

## 32. Admin: the e-mail log

1. As admin, open **E-post**: a table of every mail, newest first, with subject, **Typ**, recipient, organisation and time.
2. **Typ** (e.g. *Bokningsbekräftelse*, *Ny bokning (uthyrare)*, *Nytt lösenord*, *Admin: plats att granska*), **Organisation** (the host account a mail concerns) and the search (recipient, subject or organisation) filter it; **Sortera** orders by recipient, organisation or type.
3. Mails sent before this version have no type: they are under **Övrigt** and have no organisation.
4. A row opens the mail as the recipient saw it; its links open in a new tab, and **Som text** shows the plain-text version.

## 33. Full names

1. Book a spot as Oskar Nilsson (`forare@parklet.test`) on one of Anna's spots.
2. Anna's notification and e-mail say "Oskar Nilsson har bokat …"; the booking and the host dashboard show **Förare: Oskar Nilsson**.
3. Only the header shows the first name ("Oskar"). The public spot panel shows a private host by first name ("Uthyrare: Anna"), as the privacy policy states.

## 34. The host's pages

1. As `erik@parklet.test`, open **Uthyrning** and choose **Kvarteret Fastigheter AB**. The tabs, like the admin's: **Översikt · Granska · Parkeringsplatser · Bokningar · E-post · Administratörer**.
2. **Översikt:** the checklist while something is left, payouts (**Öppna Stripe**), and three tiles: **Att granska**, **Parkeringsplatser** (how many are rented out) and **Kommande bokningar** (with what the account has earned). Each opens its tab.
3. **Granska:** cars to register per parking space (flow 4), parking spaces to finish (drafts, and those Parklet didn't approve, with the reason), and for information those waiting for the association or landlord, those Parklet is reviewing and those the association refused. Nothing there: "Inget att granska just nu."
4. **Parkeringsplatser:** the account's spaces as a table with status chips, search (title, address, town, association), **Ort**, **Bokningsbar** and **Sortera**. A space that needs registered cars shows how many it has. **Lägg upp parkeringsplatser** starts a new one.
5. **Bokningar:** confirmed and cancelled bookings (not unpaid holds), with the driver's full name and plate, the host's share, and a warning when a car still waits for registration. Filters: **Tid**, **Från–Till**, **Sortera**, status chips and search.
6. **E-post:** the mails Parklet sent about the account to its administrators, and those that went out on their behalf (to the association or landlord, invitations). Not the drivers' confirmations or Parklet's own notices. A row opens the mail.
7. A household account (e.g. Anna's) has the same tabs; **Administratörer** explains that a private account has one administrator.

## 35. Administrators: invite, correct, take back, remove, hand over 📧

1. As `styrelsen@parklet.test`, open **Brf Linnéstaden → Administratörer**.
2. Invite an address you can read with **Bjud in**. It is listed under **Inbjudningar** with when it was sent and how long it is valid.
3. **Ändra e-post**, correct the address, **Skicka till den här adressen**: a new invitation goes to the new address and the old link stops working. **Skicka igen** resends to the same address; **Ta tillbaka** withdraws it.
4. Accept an invitation with another account (flow 10). As the owner you can then **Gör till ägare** (you stay as administrator) or **Ta bort** the other administrator. The owner can't be removed.
5. As the other administrator: **Lämna kontot** takes you out of it; you can't remove others.

## 36. Deleting a parking space, an organisation, or hosting altogether

1. **A parking space.** At the bottom of a space's page: **Ta bort parkeringsplatsen**. Without the box ticked: "Bekräfta att du vill ta bort parkeringsplatsen."
   - A draft or one never booked is removed with its documents: "Parkeringsplatsen är borttagen."
   - With coming bookings it is refused ("Det finns kommande bokningar …"). One booked before is kept out of sight for the bookkeeping: paused, gone from every list.
2. **An organisation stuck in verification.** Create an association (flow 10) and don't finish it. On its **Översikt**, **Ta bort uthyrarkontot**, tick the box: you land on **Mina sidor** with "Uthyrarkontot är borttaget." It is gone from your accounts and from the admin's lists.
3. **Stop hosting.** As the owner of your only host account, delete it the same way: **Mina sidor** then says **Kontotyp: Förare**, and **Uthyrning** shows the introduction again.
4. Only the owner sees the button; an administrator is told to leave the account under **Administratörer** instead.

## 37. Search filters

1. Search Göteborg. Over the results: **Garage · Carport · Uppfart · Utomhusplats · Under tak · Elbilsladdning**.
2. **Garage**: only garages, the button marked as on, and in the address (`typ=garage`). Add **Elbilsladdning**: garages with charging. **Under tak** also counts garages and carports.
3. The filters stay when you open a space, change the place or time, and apply to **Andra parkeringsplatser** too. **Rensa filter** removes them.

## 38. Coming back from Stripe, and the header after switching account

1. Pay a booking (flow 18) while using another address of the site than the usual one (a Vercel preview, or another alias of the deployment): you come back to the same address, still logged in, and see the booking.
2. Log in as Anna in one tab. In a second tab, log out and log in as Oskar. Back in the first tab, click any link (or just switch to it): the header shows **Oskar**, not Anna.
3. From a booking, **Visa parkeringsplatsen och boka igen** opens the space on the map, ready to book again.

