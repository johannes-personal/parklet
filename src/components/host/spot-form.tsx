"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState, useState } from "react";
import { saveSpotAction } from "@/app/uthyrare/actions";
import { errProps, FieldError, FormAlert, FormErrorSummary, SubmitButton, type FormState } from "@/components/form";
import { LocationPicker } from "@/components/map/location-picker";
import { PlaceSearch, type PickedPlace } from "@/components/place-search";
import type { Schedule } from "@/lib/schedule";
import type { SpotFormDefaults } from "./spot-form-defaults";
import { AvailabilityEditor } from "./availability-editor";

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {intro ? <p className="mt-1 text-sm text-ink-soft">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SpotForm({
  accountId,
  spotId,
  defaults,
  allowMultiple,
}: {
  accountId: string;
  spotId?: string;
  defaults: SpotFormDefaults;
  allowMultiple: boolean;
}) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(saveSpotAction, null);
  const v = (k: keyof SpotFormDefaults) => state?.values?.[k] ?? String(defaults[k] ?? "");
  const checked = (k: keyof SpotFormDefaults) => (state?.values ? state.values[k] === "on" : Boolean(defaults[k]));

  const [target, setTarget] = useState<PickedPlace | null>(null);
  const [address, setAddress] = useState(v("address"));
  const [city, setCity] = useState(v("city"));
  const [basis, setBasis] = useState(v("rightBasis"));
  const [landlordKind, setLandlordKind] = useState(v("landlordKind"));
  const imposed = Boolean(defaults.landlordRequiresRegistration);
  const [requiresReg, setRequiresReg] = useState(imposed || checked("requiresVehicleRegistration"));
  const initialPos = state?.values?.lat ? { lat: Number(state.values.lat), lng: Number(state.values.lng) } : defaults.lat != null ? { lat: defaults.lat, lng: defaults.lng! } : null;

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      {spotId ? <input type="hidden" name="spotId" value={spotId} /> : null}
      <FormAlert state={state} />

      <Section title="Var ligger platsen?">
        <PlaceSearch
          id={f("addressSearch")}
          label="Sök adress"
          showNearMe={false}
          showFullAddress
          placeholder="Gatuadress och ort"
          onPick={(p) => {
            if (!p) return;
            setTarget(p);
            // A named place ("Malmö Arena") still gets its street address in the address field.
            if (p.street || p.detail || p.label) setAddress(p.street ?? p.label);
            if (p.city) setCity(p.city);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor={f("address")} className="label">
              Adress
            </label>
            <input id={f("address")} name="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} {...errProps(state, "address")} />
            <FieldError state={state} name="address" />
          </div>
          <div>
            <label htmlFor={f("city")} className="label">
              Ort
            </label>
            <input id={f("city")} name="city" className="input" value={city} onChange={(e) => setCity(e.target.value)} {...errProps(state, "city")} />
            <FieldError state={state} name="city" />
          </div>
        </div>
        <LocationPicker defaultValue={initialPos} target={target} invalid={Boolean(state?.fieldErrors?.lat)} />
        <FieldError state={state} name="lat" />
      </Section>

      <Section title="Om platsen">
        <div>
          <label htmlFor={f("title")} className="label">
            Rubrik
          </label>
          <input id={f("title")} name="title" className="input" placeholder="T.ex. Garageplats nära Järntorget" defaultValue={v("title")} {...errProps(state, "title")} />
          <FieldError state={state} name="title" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={f("spotType")} className="label">
              Typ av plats
            </label>
            <select id={f("spotType")} name="spotType" className="input" defaultValue={v("spotType")}>
              <option value="outdoor">Utomhusplats</option>
              <option value="garage">Garage</option>
              <option value="carport">Carport</option>
              <option value="driveway">Uppfart</option>
            </select>
          </div>
          <div>
            <label htmlFor={f("maxHeight")} className="label">
              Maxhöjd i meter (valfritt)
            </label>
            <input id={f("maxHeight")} name="maxHeight" inputMode="decimal" className="input" placeholder="T.ex. 2,10" defaultValue={v("maxHeight")} {...errProps(state, "maxHeightCm")} />
            <FieldError state={state} name="maxHeightCm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="covered" className="size-4 accent-brand" defaultChecked={checked("covered")} /> Under tak
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="evCharging" className="size-4 accent-brand" defaultChecked={checked("evCharging")} /> Laddning för elbil
          </label>
        </div>
        <div>
          <label htmlFor={f("description")} className="label">
            Beskrivning (valfritt)
          </label>
          <textarea id={f("description")} name="description" rows={3} className="input" placeholder="Hur stor är platsen? Finns det något föraren bör veta?" defaultValue={v("description")} />
        </div>
        {allowMultiple && !spotId ? (
          <div>
            <label htmlFor={f("count")} className="label">
              Antal likadana parkeringsplatser
            </label>
            <input id={f("count")} name="count" type="number" min={1} max={50} defaultValue={state?.values?.count ?? "1"} className="input w-28" />
            <p className="hint">Har föreningen flera parkeringsplatser med samma villkor skapas de som &quot;Plats 1&quot;, &quot;Plats 2&quot; osv.</p>
          </div>
        ) : null}
      </Section>

      <Section
        title="Din rätt att hyra ut platsen"
        intro="Vi kräver dokumentation som styrker ägande eller nyttjanderätt till platsen och verifierar att du har rätt att hyra ut den innan uthyrning kan ske. För en hyrd plats i en BRF krävs föreningens godkännande."
      >
        <fieldset>
          <legend className="sr-only">Äger eller hyr du platsen?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-checked:border-brand has-checked:bg-brand-soft">
              <input type="radio" name="rightBasis" value="owns" className="mt-1 accent-brand" checked={basis === "owns"} onChange={() => setBasis("owns")} />
              <span>
                <span className="font-medium">Jag/vi äger platsen</span>
                <span className="block text-sm text-ink-soft">T.ex. egen villa, egen fastighet eller föreningens egna parkeringsplatser.</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-checked:border-brand has-checked:bg-brand-soft">
              <input type="radio" name="rightBasis" value="rents" className="mt-1 accent-brand" checked={basis === "rents"} onChange={() => setBasis("rents")} />
              <span>
                <span className="font-medium">Jag hyr platsen</span>
                <span className="block text-sm text-ink-soft">Av min bostadsrättsförening eller av en hyresvärd/företag.</span>
              </span>
            </label>
          </div>
          <FieldError state={state} name="rightBasis" />
        </fieldset>
        {basis === "rents" ? (
          <div className="space-y-4 rounded-xl bg-canvas p-4">
            <fieldset>
              <legend className="label">Vem hyr du platsen av?</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="landlordKind" value="brf" className="accent-brand" checked={landlordKind === "brf"} onChange={() => setLandlordKind("brf")} />
                  Bostadsrättsföreningen
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="landlordKind" value="landlord" className="accent-brand" checked={landlordKind === "landlord"} onChange={() => setLandlordKind("landlord")} />
                  Hyresvärd eller företag
                </label>
              </div>
              <FieldError state={state} name="landlordKind" />
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={f("landlordName")} className="label">
                  {landlordKind === "brf" ? "Föreningens namn" : "Hyresvärdens namn"}
                </label>
                <input id={f("landlordName")} name="landlordName" className="input" defaultValue={v("landlordName")} />
              </div>
              <div>
                <label htmlFor={f("landlordEmail")} className="label">
                  E-post till {landlordKind === "brf" ? "styrelsen" : "hyresvärden"}
                </label>
                <input id={f("landlordEmail")} name="landlordEmail" type="email" className="input" defaultValue={v("landlordEmail")} {...errProps(state, "landlordEmail")} />
                <FieldError state={state} name="landlordEmail" />
              </div>
            </div>
            <p className="text-sm text-ink-soft">Efter att du sparat kan du skicka en godkännandeförfrågan dit direkt från Parklet, eller ladda upp ett skriftligt godkännande.</p>
          </div>
        ) : null}
      </Section>

      <Section title="Tider, pris och villkor">
        <AvailabilityEditor defaultValue={state?.values?.schedule ? safeSchedule(state.values.schedule, defaults.schedule) : defaults.schedule} error={state?.fieldErrors?.schedule} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={f("pricePerHour")} className="label">
              Pris per timme (kr)
            </label>
            <input id={f("pricePerHour")} name="pricePerHour" inputMode="decimal" className="input" placeholder="T.ex. 20" defaultValue={v("pricePerHour")} {...errProps(state, "pricePerHourOre")} />
            <FieldError state={state} name="pricePerHourOre" />
          </div>
          <div>
            <label htmlFor={f("pricePerDay")} className="label">
              Maxpris per dygn (kr, valfritt)
            </label>
            <input id={f("pricePerDay")} name="pricePerDay" inputMode="decimal" className="input" placeholder="T.ex. 150" defaultValue={v("pricePerDay")} {...errProps(state, "pricePerDayOre")} />
            <FieldError state={state} name="pricePerDayOre" />
          </div>
          <div>
            <label htmlFor={f("minDurationMinutes")} className="label">
              Minsta bokningstid
            </label>
            <select id={f("minDurationMinutes")} name="minDurationMinutes" className="input" defaultValue={v("minDurationMinutes")}>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">1 timme</option>
              <option value="120">2 timmar</option>
              <option value="240">4 timmar</option>
              <option value="1440">1 dygn</option>
            </select>
          </div>
          <div>
            <label htmlFor={f("cancellationHours")} className="label">
              Kostnadsfri avbokning
            </label>
            <select id={f("cancellationHours")} name="cancellationHours" className="input" defaultValue={v("cancellationHours")}>
              <option value="0">Fram till start</option>
              <option value="1">Senast 1 timme innan</option>
              <option value="2">Senast 2 timmar innan</option>
              <option value="24">Senast 24 timmar innan</option>
              <option value="48">Senast 48 timmar innan</option>
            </select>
          </div>
          <div>
            <label htmlFor={f("minNoticeMinutes")} className="label">
              Framförhållning
            </label>
            <select id={f("minNoticeMinutes")} name="minNoticeMinutes" className="input" defaultValue={v("minNoticeMinutes")} {...errProps(state, "minNoticeMinutes")}>
              <option value="0" disabled={imposed}>
                Kan bokas direkt
              </option>
              <option value="60" disabled={imposed}>
                Minst 1 timme innan
              </option>
              <option value="240" disabled={imposed}>
                Minst 4 timmar innan
              </option>
              <option value="1440">Minst 1 dygn innan</option>
              <option value="2880">Minst 2 dygn innan</option>
            </select>
            <FieldError state={state} name="minNoticeMinutes" />
            {imposed ? <p className="hint">Föreningen kräver registrering, så platsen bokas minst ett dygn i förväg.</p> : null}
          </div>
        </div>
        <p className="text-sm text-muted">Föraren betalar en serviceavgift på 10 % ovanpå ditt pris. Du får hela ditt pris.</p>
      </Section>

      <Section title="Föreningens eller hyresvärdens regler">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="requiresVehicleRegistration"
            className="mt-1 size-4 accent-brand"
            checked={requiresReg}
            disabled={imposed}
            onChange={(e) => setRequiresReg(e.target.checked)}
          />
          {/* A disabled checkbox isn't sent; the server keeps the requirement anyway. */}
          {imposed ? <input type="hidden" name="requiresVehicleRegistration" value="on" /> : null}
          <span>
            <span className="font-medium">Den tillfälliga hyresgästens bil måste registreras</span>
            <span className="block text-sm text-ink-soft">
              T.ex. i föreningens parkeringssystem eller hos parkeringsbolaget. Du får förarens registreringsnummer och bockar av när bilen är
              registrerad.
            </span>
            {imposed ? (
              <span className="mt-1 block text-sm font-medium text-ink-soft">
                Föreningen eller hyresvärden kräver det i sitt godkännande, så det kan inte stängas av här.
              </span>
            ) : null}
          </span>
        </label>
        {requiresReg ? (
          <div>
            <label htmlFor={f("vehicleRegistrationNote")} className="label">
              Information till föraren (valfritt)
            </label>
            <input id={f("vehicleRegistrationNote")} name="vehicleRegistrationNote" className="input" placeholder="T.ex. Registreras hos Aimo – bilen får ett tillfälligt e-tillstånd." defaultValue={v("vehicleRegistrationNote")} />
          </div>
        ) : null}
      </Section>

      <Section title="Tillträde och synlighet">
        <div>
          <label htmlFor={f("accessInstructions")} className="label">
            Instruktioner till föraren
          </label>
          <textarea
            id={f("accessInstructions")}
            name="accessInstructions"
            rows={3}
            className="input"
            placeholder="Portkod, platsnummer, var garageinfarten är …"
            defaultValue={v("accessInstructions")}
          />
          <p className="hint">Visas bara för förare med en betald bokning.</p>
        </div>
        <fieldset>
          <legend className="label">Vem kan hitta platsen?</legend>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="visibility" value="public" className="accent-brand" defaultChecked={v("visibility") !== "link"} />
              Alla – visas i sökningen och på kartan
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="visibility" value="link" className="accent-brand" defaultChecked={v("visibility") === "link"} />
              Bara de som har länken (t.ex. grannar eller kollegor)
            </label>
          </div>
        </fieldset>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary btn-lg" pendingText="Sparar…">
          {spotId ? "Spara ändringar" : "Spara och fortsätt till underlag"}
        </SubmitButton>
        {!spotId ? <p className="text-sm text-muted">Platsen syns inte för förare förrän den är granskad och godkänd.</p> : null}
      </div>
      <FormErrorSummary state={state} />
    </form>
  );
}

function safeSchedule(raw: string, fallback: Schedule): Schedule {
  try {
    return JSON.parse(raw) as Schedule;
  } catch {
    return fallback;
  }
}
