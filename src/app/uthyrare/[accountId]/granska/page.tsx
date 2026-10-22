import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { markRegisteredAction } from "@/app/bokning-actions";
import { HostHeading, loadHostAccount } from "@/components/host/host-page";
import { Badge } from "@/components/status-badge";
import { formatRange } from "@/lib/time";
import { listAccountBookings } from "@/server/bookings";
import { listAccountSpots, type HostSpotSummary } from "@/server/spots";

export const metadata: Metadata = { title: "Granska – uthyrarkonto", robots: { index: false } };

type P = PageProps<"/uthyrare/[accountId]/granska">;

/**
 * What the account's administrators have to look at: cars to register in the
 * association's system, and parking spaces to finish, or waiting on someone else.
 */
export default function HostReviewPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { accountId } = await params;
  const loaded = await loadHostAccount(accountId, `/uthyrare/${accountId}/granska`);
  if ("denied" in loaded) return loaded.denied;
  const { account } = loaded;
  const [bookings, spots] = await Promise.all([listAccountBookings(accountId), listAccountSpots(accountId)]);
  const now = new Date();
  const cars = bookings.filter((b) => b.status === "confirmed" && b.endsAt > now && b.vehicleRegistration === "pending");
  const bySpot = new Map<string, typeof cars>();
  for (const b of cars) bySpot.set(b.spot.id, [...(bySpot.get(b.spot.id) ?? []), b]);

  const toFinish = spots.filter((s) => s.review === "rejected" || (s.review === "draft" && s.landlordApproval !== "requested" && s.landlordApproval !== "declined"));
  const waitingLandlord = spots.filter((s) => s.review === "draft" && s.landlordApproval === "requested");
  const inReview = spots.filter((s) => s.review === "pending_review");
  const declined = spots.filter((s) => s.review !== "approved" && s.landlordApproval === "declined");
  const nothing = cars.length + toFinish.length + waitingLandlord.length + inReview.length + declined.length === 0;
  const spotHref = (id: string) => `/uthyrare/${accountId}/platser/${id}`;

  return (
    <div className="space-y-8">
      <HostHeading account={account} title="Granska" />
      {nothing ? <p className="card p-6 text-ink-soft">Inget att granska just nu.</p> : null}

      {cars.length ? (
        <section id="bilar" className="card scroll-mt-24 border-warn/40 p-5 sm:p-6" aria-labelledby="bilar-rubrik">
          <h2 id="bilar-rubrik" className="text-lg font-semibold">
            Bilar att registrera <span className="text-muted">({cars.length})</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Registrera bilarna i föreningens parkeringssystem innan bokningen startar och bocka sedan av här. En bil du har registrerat gäller även nästa
            gång den bokar samma parkeringsplats; de registrerade bilarna ser och ändrar du på parkeringsplatsens sida.
          </p>
          {[...bySpot.entries()].map(([spotId, list]) => (
            <div key={spotId} className="mt-4">
              <h3 className="font-semibold">
                <Link href={`${spotHref(spotId)}#bilar`} className="hover:underline">
                  {list[0].spot.title}
                </Link>
              </h3>
              <ul className="mt-1 divide-y divide-line">
                {list.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-lg font-semibold tracking-wider">{b.vehicleReg}</p>
                      <p className="text-sm text-ink-soft">
                        {formatRange(b.startsAt, b.endsAt)} · {b.driverName}
                      </p>
                    </div>
                    <form action={markRegisteredAction}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="back" value={`/uthyrare/${accountId}/granska`} />
                      <button className="btn-primary py-2">Markera som registrerad</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <SpotGroup title="Parkeringsplatser att slutföra" hint="Ladda upp det som saknas och skicka in dem för granskning." spots={toFinish} href={spotHref}>
        {(s) => (s.review === "rejected" ? <Badge kind="danger">Ej godkänd: {s.reviewNote ?? "se platsen"}</Badge> : <Badge>Utkast</Badge>)}
      </SpotGroup>
      <SpotGroup
        title="Väntar på föreningen eller hyresvärden"
        hint="Förfrågan om godkännande är skickad. Du får ett mejl när de har svarat."
        spots={waitingLandlord}
        href={spotHref}
      />
      <SpotGroup title="Hos Parklet för granskning" hint="Vi granskar underlagen, oftast inom en arbetsdag." spots={inReview} href={spotHref} />
      <SpotGroup
        title="Nekade av föreningen eller hyresvärden"
        hint="De kan inte hyras ut via Parklet. Ta bort dem på parkeringsplatsens sida, eller kontakta föreningen."
        spots={declined}
        href={spotHref}
      />
    </div>
  );
}

function SpotGroup({
  title,
  hint,
  spots,
  href,
  children,
}: {
  title: string;
  hint: string;
  spots: HostSpotSummary[];
  href: (id: string) => string;
  children?: (s: HostSpotSummary) => React.ReactNode;
}) {
  if (spots.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted">({spots.length})</span>
      </h2>
      <p className="text-sm text-ink-soft">{hint}</p>
      <ul className="card mt-3 divide-y divide-line">
        {spots.map((s) => (
          <li key={s.id}>
            <Link href={href(s.id)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
              <span>
                <span className="block font-medium">{s.title}</span>
                <span className="text-sm text-muted">
                  {s.address}, {s.city}
                </span>
              </span>
              {children ? children(s) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
