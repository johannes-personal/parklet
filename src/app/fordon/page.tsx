import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { listVehicles } from "@/server/bookings";
import { removeVehicleAction } from "./actions";
import { AddVehicleForm } from "./add-vehicle-form";

export const metadata: Metadata = { title: "Mina fordon" };

export default function VehiclesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Mina fordon</h1>
        <p className="mt-1 text-ink-soft">
          Bilen kopplas till bokningen. Vissa föreningar kräver att bilen registreras i deras parkeringssystem – då skickas
          registreringsnumret till uthyraren.
        </p>
      </div>
      <Suspense fallback={<div className="card h-24 animate-pulse" />}>
        <VehicleList />
      </Suspense>
      <AddVehicleForm />
    </div>
  );
}

async function VehicleList() {
  const user = await requireUser("/fordon");
  const list = await listVehicles(user.id);
  if (list.length === 0) return <p className="text-sm text-muted">Inga sparade bilar än.</p>;
  return (
    <ul className="card divide-y divide-line">
      {list.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-mono font-semibold tracking-wider">{v.reg}</p>
            {v.nickname ? <p className="text-sm text-muted">{v.nickname}</p> : null}
          </div>
          <form action={removeVehicleAction}>
            <input type="hidden" name="id" value={v.id} />
            <button className="text-sm font-medium text-danger hover:underline">
              Ta bort<span className="sr-only"> {v.reg}</span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
