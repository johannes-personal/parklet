"use client";

import { useSyncExternalStore } from "react";
import { toLocalInputValue } from "@/lib/time";

const noop = () => () => {};

/**
 * Current time as a datetime-local `min`, computed only in the browser
 * (undefined during prerender). Floored to the quarter hour: the inputs use
 * step=900 and browsers count steps from `min`, so an unaligned min would
 * make 10:00 an invalid value and silently block submission.
 */
export function useNowMin(): string | undefined {
  return useSyncExternalStore(
    noop,
    () => toLocalInputValue(new Date(Math.floor(Date.now() / 900_000) * 900_000)),
    () => undefined,
  );
}
