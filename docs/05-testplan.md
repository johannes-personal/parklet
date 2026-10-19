# Manual test plan: main flows

Run against https://parklet-rebuild.vercel.app after the latest deploy.

## Accounts

All demo accounts use the password **`parklet-demo-1`**. Their addresses end
in `.test`, so their e-mails are **not delivered**. Admins can read them all,
rendered, at **Granskning → E-post**. To check real delivery, use your own
address (see the flows marked 📧).

| Login | Who | Use it for |
|---|---|---|
| `admin@parklet.test` | Parklet reviewer (admin) | Review queue, search, e-mail log |
| `forare@parklet.test` | Oskar, a driver with bookings | Booking and cancelling |
| `anna@parklet.test` | Anna, private host (Göteborg, Stockholm, Uppsala) | Host dashboard, a spot waiting for review |
| `erik@parklet.test` | Erik, private host and member of Kvarteret Fastigheter AB | Two host accounts |
| `styrelsen@parklet.test` | Sara, board of Brf Linnéstaden (its cars must be registered) | Registering a car |
| `ny@parklet.test` | Maja, new host without BankID or payouts | "Not bookable yet" states |
| `johannes@jvo.se` | You: admin and host | 📧 Real admin e-mails and the daily summary |

Notes:
- Payments are in test mode.
- BankID goes through Idura's test environment.
- For a new 📧 account, register with a real address you can read (for example `snyggast@jvo.se`, or a `+` alias if your mail supports it).

---

## 1. Driver: find, share, book, cancel

1. Log out. Open **Hitta parkering**. Search for "Göteborg".
   - The map fills the page and the list floats on the left.
   - The map credits show only as a small **(i)** in the corner; clicking it expands them.
2. Click **Carport nära Liseberg**, in the list or on its pin.
   - The spot opens in a panel on the right, still over the map (the URL gets `plats=`).
3. In the panel header, click **Kopiera länk**.
   - The button briefly reads "Kopierad!".
   - Paste the link into a new tab: it opens the spot's own page, with the chosen times if you set any.
   - On a phone the button reads **Dela** and opens the share sheet.
4. In the booking box, try **Nu** and the duration chips (1 h, 2 h …). Times move in 5-minute steps.
5. Click **Logga in och boka** and log in as `forare@parklet.test`.
   - You come back to the same spot, over the map, with the times kept.
6. Continue to payment and pay in test mode.
   - You see the booking with directions.
   - **Bell:** "Bokningsbekräftelse".
   - **E-post (admin log):** the booking confirmation with Plats/Tid/Bil/Totalt betalt.
7. Open **Mina bokningar**, open the booking and cancel it.
   - The host (Erik) gets "Avbokning: …" in the bell.

## 2. Host: register a spot in two steps 📧

Use your own account, or a new account with a real address.

1. Open **Meny**.
   - It is grouped as **Parkera** / **Hyr ut** / **Administration** (Administration shows for admins only).
2. Under **Uthyrning**, choose **Lägg upp en plats**.
3. **Step 1, Uppgifter:**
   - Enter an address and pick the point on the map.
   - Enter a title and a price.
   - For "rätt att hyra ut", choose that you rent the spot from a **BRF**, and give your own e-mail as the board's address.
   - Click **Spara och fortsätt till underlag**.
4. **Step 2, Underlag:**
   - Click **Skicka in för granskning** first: it is refused because documents are missing.
   - Upload a PDF under **Hyresavtal**: you see "<fil> är uppladdad." and a ✓.
   - Under **Övriga dokument**, choose a type and upload a file.
   - Then click **Ta bort** on it: the message changes to "**<fil> är borttagen.**"
   - Click **Skicka godkännandeförfrågan**.
5. 📧 In your inbox, check the e-mail "Godkännande för uthyrning av parkeringsplats".
   - It has the logo, the details and the button **Granska och svara**.
   - Open it and approve as the board.
   - **Bell (host):** "…: uthyrningen är godkänd".
6. Click **Skicka in för granskning**.

## 3. Admin: notified, search, review 📧

Log in as `johannes@jvo.se`, or as `admin@parklet.test` and use the e-mail log.

1. **Bell:**
   - The red number counts new events. It **disappears when you open the bell** and stays gone after you navigate.
   - "Att göra" lists "Granska N platser" / "Verifiera N organisationer". When only tasks remain, the bell shows a yellow dot.
2. 📧 Check the inbox for "Ny plats att granska: …", with the button **Granska platsen**.
3. **Granskning:** the tabs are *Att granska · Platser · Uthyrare · E-post*.
4. **Platser:**
   - Search for part of a title, an address, an org. number or a spot ID.
   - Try the filters: Grund, Ort, Bokningsbar, Sortera.
   - Try the status chips; their counts should match the filters.
   - "Bokningsbar: Nej" tells you why, for example "Utbetalning saknas".
5. **Uthyrare:**
   - Search for a name, an org. number, or an owner's name or e-mail.
   - Filter on Typ, Utbetalning and the verification chips.
   - The owner's BankID status is shown. "Platser" links to that host's spots.
6. Open the spot from flow 2.
   - It shows "Godkänt via länk av …".
   - Click **Godkänn**. The host gets "Din plats … är godkänd" (bell + e-mail).
7. **E-post:** open any mail with **Visa som mejl** to see it rendered.

## 4. Booking where the car must be registered

1. Log in as `forare@parklet.test`.
2. Book **Garage Linnégatan** (Göteborg) more than 24 h ahead.
   - The spot requires 24 h notice.
   - The confirmation says the host must register the car.
3. Log in as `styrelsen@parklet.test`.
   - The bell shows a red number and "Registrera ABC… – ny bokning".
   - The e-mail's button is **Markera bilen som registrerad**.
4. Click the task.
   - The account page opens at **Bilar att registrera**.
   - Click **Markera som registrerad**.
5. Log in as the driver.
   - The bell shows "… är registrerad för Garage Linnégatan".
   - The booking shows "Registrerad".
6. *(Optional, takes time)* Leave a booking unregistered.
   - 2 h before start, the host gets a reminder.
   - At the start, the driver gets "vänta med att parkera", the host gets a warning, and admins see it in the bell.

## 5. Organisation verification

1. As any user, choose **Hyr ut → Bostadsrättsförening**.
2. Enter an org. number.
   - An invalid checksum is refused.
   - A real number is looked up at Bolagsverket.
3. Verify with BankID and send the organisation for verification.
   - Admins get "Ny organisation att verifiera: …" (bell + e-mail).
4. As admin, open it from **Att granska** or **Uthyrare**.
   - Check what Bolagsverket said.
   - Click **Godkänn**. The members get "Er organisation är verifierad".
5. Invite a co-administrator with a real address.
   - 📧 The invite e-mail has the button **Acceptera inbjudan**.

## 6. Password reset 📧

1. Log out and click **Glömt lösenordet?**.
2. Enter your real address.
3. The e-mail has the button **Välj nytt lösenord**. The new password works.

## 7. Daily summary 📧

This one can't be triggered from the UI.

- It is sent every morning at 06:00 UTC (08:00 Swedish summer time) to all admins, but only when something is waiting or happened in the last 24 hours.
- Check `johannes@jvo.se` the next morning for "Parklet: N att granska" or "Parklet: dagens sammanfattning".
