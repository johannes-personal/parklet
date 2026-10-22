import { Suspense } from "react";
import { HostTabs } from "@/components/host/host-tabs";

export default function HostAccountLayout({ children }: LayoutProps<"/uthyrare/[accountId]">) {
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <Suspense fallback={<div className="h-11 rounded-xl bg-white/5" />}>
          <HostTabs />
        </Suspense>
      </div>
      {children}
    </>
  );
}
