import type { Schedule } from "@/lib/schedule";

// Kept out of the "use client" spot form: server components import these values,
// and exports of a client module arrive on the server as client references.
export type SpotFormDefaults = {
  title: string;
  description: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  spotType: string;
  covered: boolean;
  evCharging: boolean;
  maxHeight: string;
  pricePerHour: string;
  pricePerDay: string;
  minDurationMinutes: number;
  minNoticeMinutes: number;
  cancellationHours: number;
  accessInstructions: string;
  visibility: string;
  schedule: Schedule;
  rightBasis: string;
  landlordKind: string;
  landlordName: string;
  landlordEmail: string;
  requiresVehicleRegistration: boolean;
  vehicleRegistrationNote: string;
  /** The landlord or BRF required registration in its approval: the host can't turn it off. */
  landlordRequiresRegistration?: boolean;
};

export const EMPTY_SPOT: SpotFormDefaults = {
  title: "",
  description: "",
  address: "",
  city: "",
  lat: null,
  lng: null,
  spotType: "outdoor",
  covered: false,
  evCharging: false,
  maxHeight: "",
  pricePerHour: "",
  pricePerDay: "",
  minDurationMinutes: 60,
  minNoticeMinutes: 0,
  cancellationHours: 2,
  accessInstructions: "",
  visibility: "public",
  schedule: { mode: "always" },
  rightBasis: "",
  landlordKind: "",
  landlordName: "",
  landlordEmail: "",
  requiresVehicleRegistration: false,
  vehicleRegistrationNote: "",
};

