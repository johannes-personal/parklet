"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { sessionUserAction } from "@/app/notification-actions";

/**
 * The header is rendered once and kept on client-side navigation. When the session
 * changes elsewhere (another tab logs out, or in as someone else), the pages follow
 * the new cookie but the header would not; this re-renders it when that happens.
 */
export function SessionWatch({ userId }: { userId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let current = true;
    const check = () =>
      sessionUserAction().then((now) => {
        if (current && now !== userId) router.refresh();
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      current = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, userId, router]);
  return null;
}
