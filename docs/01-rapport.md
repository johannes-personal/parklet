# Review of parklet.se (15 October 2026)

**Scope.** The public site at `www.parklet.se` (Next.js on Azure Static Web Apps), the
info site at `info.parklet.se` (Framer), and the publicly downloadable JavaScript of the
logged-in host flow (`/rental-flow?mode=admin-parking`). Testing used a headless Chromium
at desktop (1366×900) and phone (390×844) sizes, plus direct HTTP checks.

**Not tested.** Anything behind login: booking, payment, the host dashboard. I didn't
create an account on the production site. The host-flow findings come from strings and
API calls in the shipped client bundle, not from using the flow.

Severity: **P0** blocks the core business, **P1** a broken or untrustworthy core flow,
**P2** a clear defect, **P3** polish.

---

## Summary

| # | Finding | Severity |
|---|---|---|
| 1 | The marketplace is effectively empty: one listing in all of Sweden, and it is closed | P0 |
| 2 | No terms of service, no privacy policy, and no consent at sign-up, yet personnummer is collected | P0 |
| 3 | "Hyr ut plats" / "Till Parklet" on the info site point to a domain that does not exist | P0 |
| 4 | Location search is broken in three ways (reverse geocoding 422s, unfocused input, bogus "location denied" errors) | P1 |
| 5 | The search results map renders only partly | P1 |
| 6 | No password reset at all, even though the FAQ tells users how to reset | P1 |
| 7 | Hosting in the US (Azure East US 2) for a Swedish-only service | P1 |
| 8 | The host flow ships developer and English error messages, and admits groups aren't saved | P1 |
| 9 | Two disconnected sites, with mixed languages and branding ("My Framer Site") | P2 |
| 10 | The search API over-exposes internal data and accepts a 2,000 km radius | P2 |
| 11 | Forms lack basic validation and password-manager support | P2 |
| 12 | Accessibility: buttons pretending to be inputs, English labels, hidden mobile CTA | P2 |
| 13 | SEO basics missing (robots.txt, sitemap, lang, content on the home page) | P2 |
| 14 | Swedish UI with US date formats, past times offered, a 4-week horizon | P2 |
| 15 | Duplicate API calls on every page | P3 |
| 16 | Copy errors on the info site | P3 |

---

## P0: Business-critical

### 1. There is nothing to book
`POST /api/parking/discovery` is the endpoint the search page itself calls. Called with a
2,000 km radius centred on Sweden, it returns **one listing** ("Odinslundsgatan 9", Göteborg).
Its only schedule ran 2026-10-11 to 2026-10-15, so today it shows
`"availability": "Stängt vid vald tid"` and `"price": "Inget pris för vald tid"`.

On top of that, the map opens over **Stockholm** while the company and its only listing are in
Göteborg. A first-time visitor who clicks "Sök parkering" gets *"Inga parkeringsplatser kunde
hittas"* on a dark, partly rendered map (see #5).

*Fix:* supply comes first. The product has to make listing easy, and the empty state has to
sell listing ("Har du en plats här? Hyr ut den").

### 2. Missing legal basics (GDPR, e-commerce law)
- `/privacy`, `/terms`, `/integritetspolicy`, `/villkor` all return 404 on both domains.
  There is no company name, org.nr or address anywhere. Swedish e-commerce law
  (e-handelslagen) requires service provider identification.
- The registration form (`/register`) has no terms or privacy checkbox and no link to either.
- The host flow asks for a **personnummer in a free-text field** (`"Personnummer"`,
  placeholder `ÅÅÅÅMMDD-XXXX`). Personnummer may only be processed when clearly justified
  (dataskyddslagen 3:10). The robust way to get a verified one is e-ID (BankID), not typing.

### 3. Dead links to a non-existent domain
On `info.parklet.se`, the footer links **"Till Parklet"** → `https://app.parklet.nu/` and
**"Hyr ut plats"** → `https://app.parklet.nu/upload-parking`. DNS for `parklet.nu` and
`app.parklet.nu` returns NXDOMAIN, so these links lead nowhere. The header's **"Hyr ut en
plats"** goes to the home page instead of the host flow.

---

## P1: Broken core flows and trust

### 4. Location search is broken
![Location error while typing an address](images/current-location-error.png)

- **Reverse geocoding fails on every focus.** The client calls
  `api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json?types=address,poi,neighborhood,locality&limit=8`.
  Mapbox answers **422** *"limit must be combined with a single type parameter when reverse
  geocoding"*. That's four failing requests per focus, so "Använd din plats" can never work.
- **Clicking "Var" doesn't focus the input.** "Var / Sök plats" is a `<button>`. After
  clicking it, typing goes nowhere and the panel says "Inga förslag ännu". You have to click a
  second time.
- **"Platsåtkomst nekad" errors appear while typing an address.** The user never asked for
  their location. Two red error banners sit above perfectly good suggestions.

### 5. The results map renders only partly
![Search page with half-rendered map](images/current-search-partial-map.png)

After "Sök parkering" the map canvas is a ~490 px square in the middle of the screen with
blank space around it. This is the classic symptom of a map created before its container got
its size, and never told to resize (`map.resize()`).

### 6. No way to reset a password
The login form has no "Glömt lösenord?" link, and `/forgot-password` and `/reset-password`
return 404. The support FAQ has a question "Jag har glömt mitt lösenord, vad gör jag?". Every
forgotten password becomes a support ticket or a lost user.

### 7. Hosted in the USA
`www.parklet.se` resolves to `…msha-slice-1-eus2-0…azurewebsites.net` (**Azure East US 2**,
Virginia). For a service whose users are all in Sweden, that means:
- about 100 ms of extra latency on every request
- personal data (accounts, licence plates, location, personnummer) transferred to a third
  country, which needs a transfer mechanism (EU–US DPF/SCCs) and has to be disclosed

An EU region (Sweden Central / North Europe) costs the same.

### 8. The host flow shows developer messages and admits gaps
The shipped bundle for `/rental-flow` contains, among others:
- `"Select an organization before creating parking."` (English, shown in a Swedish UI)
- `"Organisationen skapades, men backend-svaret saknade organisations-id."`
- `"Organisationen finns redan, men dess organisations-id kunde inte hämtas."`
- `"Grupper hanteras i MVP-dashboarden. Fortsatt setup sker utan gruppsparning i detta steg."`
  This tells the user that groups they set up are **not saved**.

The flow's structure is reasonable: account type, Egenbevis, plan, parking areas with
Äger/Hyr proof, schedule, groups. The problem is the execution and error handling.

The login also relies on **"Logga in med Access"**, a QR code for the Neuro Access app.
Most Swedes have BankID; a separate identity app is a big hurdle for both drivers and hosts.

---

## P2: Clear defects

### 9. Two sites, two languages, two brands
- The app (Next.js, dark theme) and the info site (Framer, light theme) have different
  navigation, footers and visual language. The app's home page has no information at all;
  everything explanatory lives on another subdomain.
- The app declares `<html lang="en">` with English `<title>`/`description` ("Find space.
  Share space.") on Swedish pages. Some pages are English outright: `/dashboard` says
  "You need to log in first." / "Go to login", and 404 is Next.js' default
  *"404: This page could not be found."*
- News articles are titled **"… – My Framer Site"** in the browser tab and in search results.

### 10. The search API over-exposes data
The anonymous discovery endpoint returns the full internal policy objects: policy IDs, area
IDs, approval mode, deposit, cancellation limits, schedule internals. It accepts any radius
(2,000 km worked) with no limit or pagination. Prices look mechanically derived (daily =
24 × hourly = 360 kr, monthly 10,920 kr), so there is no real long-stay discount.

### 11. Forms
- No `required` attributes and no inline validation on login or registration. The password
  field has `autocomplete=""` (breaks password managers) and no stated minimum length.
- The registration form asks for first and last name in separate fields but never explains
  what the account allows, and has no consent (see #2).

### 12. Accessibility
- The search "fields" (Var, Från och med, Till och med) are buttons, so screen readers
  announce "button Var Sök plats" and there is nothing to type into until it opens.
- Mixed-language accessible names ("Toggle attribution", "Öppna meny").
- On mobile the **"Bli uthyrare"** call to action is hidden. That's the supply side of the
  marketplace.
- The logged-out menu lists "Mina bokningar", "Mina fordon", "Grupper", none of which work
  without an account, and no links to help, about or legal pages.

![Logged-out menu](images/current-menu-logged-out.png)

### 13. SEO
`/robots.txt` and `/sitemap.xml` return 404. The home page is a map with a dialog: no
headline, no text, no city pages. Search engines (and people) can't tell what the service is
or where it works. Images on the info site have no `alt` text. The info site also logs a
JavaScript error on load (*"Resolved value '[object Object]' is not valid for type
'string'"*).

### 14. Dates and times
- "Nu och nära" fills the start as **`10/15 · 13:15`**, a US month/day format in a Swedish UI.
- The date picker offers only four weeks ahead. The time list starts at 00:00 on today's
  date, offering times that have already passed.

---

## P3: Polish

### 15. Duplicate requests
Each page load calls `/api/navigation` twice. A search calls `/api/vehicles` and
`/api/parking/discovery` twice. That suggests effects running twice, or the same data
fetched by two components.

### 16. Copy errors (info site)
- "Partille Tidning **repotage**" → *reportage*.
- The statistic blocks have label and value swapped: "Av parkeringsplatser i städer / står
  30% tomma", "Förloras på att leta parkering / 15 min dagligen".
- "Vi sträcker oss från fastighetsägare tomma platser…" (missing *s*: *fastighetsägares*).
- A missing closing quote in the Partille Tidning headline.

---

## What the new MVP does about each finding

| Finding | In the MVP |
|---|---|
| 1 Empty marketplace | Home page explains the service and recruits hosts; the empty state links to listing; seed data covers four cities; search widens from 3 km to 15 km automatically |
| 2 Legal | Terms and privacy pages (drafts for legal review), consent at sign-up, BankID instead of typed personnummer |
| 3 Dead links | One app on one domain; every link is covered by the smoke test |
| 4 Location search | Accessible combobox; location only on explicit "Nära mig"; city fallbacks when the geocoder is down |
| 5 Map | Map resized after layout; the list is the accessible source of truth |
| 6 Password reset | Full reset flow with hashed one-time tokens |
| 7 Hosting | Stack recommendation pins EU regions (see 02-tech-stack.md) |
| 8 Host flow | Verification lifecycle with clear Swedish messages, document upload, BRF approval link, admin review |
| 9 Two sites | One Next.js app, Swedish throughout, `lang="sv"`, Swedish 404/error pages |
| 10 API exposure | Server-rendered search returns only display fields; radius fixed at 3/15 km; results capped |
| 11 Forms | Labelled fields, inline errors, `autocomplete`, 10-character minimum, show/hide password |
| 12 Accessibility | Real inputs, skip link, focus styles, aria-live price and search updates, no hidden CTAs |
| 13 SEO | robots.txt, sitemap, Swedish metadata, content on the home page, city links |
| 14 Dates | Stockholm time zone throughout, Swedish formatting, DST-safe availability checks |
