import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SpotForm } from "@/components/host/spot-form";
import type { SpotFormDefaults } from "@/components/host/spot-form-defaults";
import { NoAccountAccess, SpotGone } from "@/components/host/host-access";
import { SpotSteps } from "@/components/host/spot-steps";
import { requireUser } from "@/lib/auth/session";
import { oreToSekInput } from "@/lib/money";
import { getAccountForMember } from "@/server/host-accounts";
import { getSpot } from "@/server/spots";

export const metadata: Metadata = { title: "Uppgifter om platsen" };

type P = PageProps<"/uthyrare/[accountId]/platser/[spotId]/uppgifter">;

/** Step 1 for an existing spot: edit its details. Saving returns to the documents step. */
export default function EditSpotDetailsPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { accountId, spotId } = await params;
  const user = await requireUser(`/uthyrare/${accountId}/platser/${spotId}/uppgifter`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) return <NoAccountAccess user={user} accountId={accountId} spotId={spotId} returnTo={`/uthyrare/${accountId}/platser/${spotId}/uppgifter`} />;
  const spot = await getSpot(spotId);
  if (!spot || spot.hostAccountId !== accountId) return <SpotGone accountId={accountId} accountName={account.name} />;
  const overview = `/uthyrare/${accountId}/platser/${spotId}`;

  const defaults: SpotFormDefaults = {
    title: spot.title,
    description: spot.description,
    address: spot.address,
    city: spot.city,
    lat: spot.lat,
    lng: spot.lng,
    spotType: spot.spotType,
    covered: spot.covered,
    evCharging: spot.evCharging,
    maxHeight: spot.maxHeightCm ? String(spot.maxHeightCm / 100).replace(".", ",") : "",
    pricePerHour: oreToSekInput(spot.pricePerHourOre),
    pricePerDay: oreToSekInput(spot.pricePerDayOre),
    minDurationMinutes: spot.minDurationMinutes,
    minNoticeMinutes: spot.minNoticeMinutes,
    cancellationHours: spot.cancellationHours,
    accessInstructions: spot.accessInstructions,
    visibility: spot.visibility,
    schedule: spot.schedule,
    rightBasis: spot.rightBasis,
    landlordKind: spot.landlordKind ?? "",
    landlordName: spot.landlordName ?? "",
    landlordEmail: spot.landlordEmail ?? "",
    requiresVehicleRegistration: spot.requiresVehicleRegistration,
    vehicleRegistrationNote: spot.vehicleRegistrationNote,
    landlordRequiresRegistration: spot.landlordRequiresRegistration,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={overview} className="link text-sm">
          ← {spot.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Uppgifter om platsen</h1>
        <div className="mt-3">
          <SpotSteps current={1} done={spot.review === "approved" ? 3 : spot.review === "pending_review" ? 2 : 1} links={{ 2: overview }} />
        </div>
      </div>
      {spot.review === "approved" || spot.review === "pending_review" ? (
        <p className="text-sm text-muted">
          Ändrar du adress eller uthyrningsgrund behöver platsen granskas igen innan den kan bokas. Byter du förening eller hyresvärd (eller dess
          e-post) behövs ett nytt godkännande, och platsen går tillbaka till utkast tills du skickar in den igen.
        </p>
      ) : null}
      <SpotForm accountId={accountId} spotId={spot.id} defaults={defaults} allowMultiple={false} />
    </div>
  );
}
