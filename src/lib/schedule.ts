import { z } from "zod";
import { normalizeWindows, PRESETS, windowsFromRange, type AvailabilityWindow, type PresetKey } from "./availability";

/**
 * What the host edits. Stored as-is so the editor round-trips exactly; the
 * bookable windows are always derived from it on the server.
 */
export const scheduleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.enum(Object.keys(PRESETS) as [PresetKey, ...PresetKey[]]) }),
  z.object({
    mode: z.literal("custom"),
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(1).max(7),
          from: z.number().int().min(0).max(1440),
          to: z.number().int().min(0).max(1440),
        }),
      )
      .max(7),
  }),
]);

export type Schedule = z.infer<typeof scheduleSchema>;

export const DEFAULT_SCHEDULE: Schedule = { mode: "always" };

/** Each custom row is one range per weekday; `to <= from` means it runs overnight into the next day. */
export function scheduleToWindows(s: Schedule): AvailabilityWindow[] {
  if (s.mode !== "custom") return PRESETS[s.mode].windows();
  return normalizeWindows(s.days.flatMap((d) => (d.from === d.to && d.from !== 0 ? [] : windowsFromRange([d.weekday], d.from, d.to === 0 && d.from === 0 ? 1440 : d.to))));
}
