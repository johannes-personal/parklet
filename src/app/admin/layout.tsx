import { Suspense } from "react";
import { AdminTabs } from "./admin-tabs";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8">
      <Suspense fallback={<div className="h-11 rounded-xl bg-white/5" />}>
        <AdminTabs />
      </Suspense>
      {children}
    </div>
  );
}
