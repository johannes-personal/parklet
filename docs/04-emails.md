# E-mails and notifications

Every e-mail uses the same template (`src/lib/email-template.ts`): the Parklet
logo, a heading, the message, a table of key facts, one button and a footer.
Each one is also stored in `mail_outbox`, and admins can read all of them,
rendered, at `/admin/epost`. Addresses on demo domains (`*.test`,
`example.*`) are stored but not sent.

"Bell" means the notification also shows up in the header bell.

| When | Who | Subject (example) | Bell | Button |
|---|---|---|---|---|
| **Accounts** | | | | |
| Forgotten password | The user | Välj ett nytt lösenord för Parklet | – | Välj nytt lösenord |
| Invited as co-administrator | The invitee | Erik Berg har bjudit in dig att administrera Kvarteret AB på Parklet | – | Acceptera inbjudan |
| Organisation sent for verification | All admins | Ny organisation att verifiera: Brf X | ✓ | Granska organisationen |
| Organisation verified / needs more / approval removed | Host account members | Er organisation är verifierad på Parklet | ✓ | Öppna i Parklet |
| Household approved / not approved / approval removed | The household's owner | Godkännandet av ditt uthyrarkonto har tagits bort | ✓ | Öppna i Parklet |
| Rejected household identified with BankID again | All admins | Privat uthyrare att granska igen: Anna L | ✓ | Granska kontot |
| **Spots** | | | | |
| Approval request to BRF/landlord | The landlord's address (no account needed; if the address has a Parklet account, the request is also in that user's bell, without a second e-mail) | Godkännande för uthyrning av parkeringsplats – Linnégatan 40 | ✓ if the address has an account | Granska och svara |
| Landlord answered | Host account members | Garage X: uthyrningen är godkänd | ✓ | Öppna i Parklet |
| Spot sent for review (one mail for spots at the same address) | All admins | Ny plats att granska: Garage X (+2 till på samma adress) | ✓ | Granska platsen |
| Spot approved / needs more | Host account members | Din plats Garage X är godkänd | ✓ | Öppna i Parklet |
| **Bookings** | | | | |
| New booking | Host account members | Ny bokning: Garage X | ✓ | Visa bokningen |
| New booking, car must be registered | Host account members | Registrera ABC123 – ny bokning av Garage X | ✓ | Markera bilen som registrerad |
| Booking confirmation | Driver | Bokningsbekräftelse: Garage X | ✓ | Visa bokningen |
| Driver cancelled | Host account members | Avbokning: Garage X | ✓ | Öppna i Parklet |
| Host cancelled | Driver | Din bokning av Garage X är avbokad | ✓ | Öppna i Parklet |
| Car registered by host | Driver | ABC123 är registrerad för Garage X | ✓ | Öppna i Parklet |
| 2 h before start, car not registered | Host account members | Påminnelse: registrera ABC123 före kl. 10:00 | ✓ | Öppna i Parklet |
| Start time passed, car not registered | Driver | ABC123 är inte registrerad än – vänta med att parkera | ✓ | Öppna i Parklet |
| Start time passed, car not registered | Host account members | Bokningen har börjat – ABC123 är inte registrerad | ✓ | Öppna i Parklet |
| Start time passed, car not registered | All admins | Bil ej registrerad vid start: Garage X | ✓ (bell only) | – |
| **Admins** | | | | |
| Every morning (06:00 UTC), if anything to report | All admins | Parklet: 3 att granska / Parklet: dagens sammanfattning | – | Öppna granskningen |

The daily summary lists what is waiting for review (with the oldest wait and
links), and the last 24 hours: bookings and their total, cancellations, cars
not registered in time, and new spots, host accounts and users.

## Scheduling

Two Supabase `pg_cron` jobs call the app with a token stored in
`public.app_secrets` (or `CRON_SECRET`, if set):

- `parklet-reminders`, every 10 minutes: `/api/cron/paminnelser`
- `parklet-admin-digest`, daily at 06:00 UTC: `/api/cron/sammanfattning`
