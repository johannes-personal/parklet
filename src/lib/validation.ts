import { z } from "zod";
export const MIN_PASSWORD_LENGTH = 10;
import { isInSweden } from "./geo";
import { scheduleSchema } from "./schedule";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ange en giltig e-postadress." }));

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { error: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.` })
  .max(200, { error: "Lösenordet är för långt." });

export const registerSchema = z.object({
  name: z.string().trim().min(2, { error: "Ange ditt namn." }).max(80),
  email: emailSchema,
  password: passwordSchema,
  terms: z.literal("on", { error: "Du behöver godkänna villkoren och integritetspolicyn." }),
});

/** Swedish plates (ABC123 / ABC12A) plus a permissive fallback for foreign plates. */
export function normalizeVehicleReg(value: string): string | null {
  const cleaned = value.toUpperCase().replace(/[\s-]/g, "");
  if (/^[A-ZÅÄÖ]{3}\d{2}[A-Z\d]$/.test(cleaned)) return cleaned;
  if (/^[A-ZÅÄÖ\d]{2,10}$/.test(cleaned)) return cleaned;
  return null;
}

export const spotSchema = z
  .object({
    title: z.string().trim().min(3, { error: "Ge platsen en kort rubrik." }).max(80),
    description: z.string().trim().max(1000).default(""),
    address: z.string().trim().min(3, { error: "Ange adressen." }).max(200),
    city: z.string().trim().min(2, { error: "Ange ort." }).max(80),
    lat: z.coerce.number({ error: "Placera platsen på kartan." }),
    lng: z.coerce.number({ error: "Placera platsen på kartan." }),
    spotType: z.enum(["outdoor", "garage", "carport", "driveway"], { error: "Välj typ av plats." }),
    covered: z.boolean(),
    evCharging: z.boolean(),
    maxHeightCm: z.number().int().min(150).max(500).nullable(),
    pricePerHourOre: z
      .number({ error: "Ange ett timpris." })
      .int()
      .min(100, { error: "Timpriset måste vara minst 1 kr." })
      .max(100_000, { error: "Timpriset kan vara högst 1 000 kr." }),
    pricePerDayOre: z.number().int().min(100).max(1_000_000).nullable(),
    minDurationMinutes: z.number().int().refine((v) => [15, 30, 60, 120, 240, 1440].includes(v)),
    cancellationHours: z.number().int().refine((v) => [0, 1, 2, 24, 48].includes(v)),
    accessInstructions: z.string().trim().max(1000).default(""),
    visibility: z.enum(["public", "link"]),
    schedule: scheduleSchema,
    minNoticeMinutes: z.number().int().refine((v) => [0, 60, 240, 1440, 2880].includes(v)),
    rightBasis: z.enum(["owns", "rents"], { error: "Ange om du äger eller hyr platsen." }),
    landlordKind: z.enum(["brf", "landlord"]).nullable(),
    landlordName: z.string().trim().max(120).default(""),
    landlordEmail: z.union([z.literal(""), emailSchema]).default(""),
    requiresVehicleRegistration: z.boolean(),
    vehicleRegistrationNote: z.string().trim().max(500).default(""),
  })
  .refine((v) => v.rightBasis !== "rents" || v.landlordKind != null, {
    error: "Ange om du hyr platsen av en bostadsrättsförening eller en hyresvärd.",
    path: ["landlordKind"],
  })
  .refine((v) => !v.requiresVehicleRegistration || v.minNoticeMinutes >= 60, {
    error: "När bilen måste registreras behöver bokningar göras i förväg. Välj minst 1 timmes framförhållning.",
    path: ["minNoticeMinutes"],
  })
  .refine((v) => isInSweden({ lat: v.lat, lng: v.lng }), {
    error: "Platsen måste ligga i Sverige. Placera nålen på kartan.",
    path: ["lat"],
  })
  .refine((v) => v.pricePerDayOre == null || v.pricePerDayOre >= v.pricePerHourOre, {
    error: "Dygnspriset kan inte vara lägre än timpriset.",
    path: ["pricePerDayOre"],
  });

export type SpotInput = z.infer<typeof spotSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
