import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { acceptInvitationAction } from "@/app/uthyrare/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvitation } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Inbjudan", robots: { index: false } };

type P = PageProps<"/inbjudan/[token]">;

export default function InvitationPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <Suspense fallback={<div className="card h-60 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: P) {
  const { token } = await params;
  const { fel } = await searchParams;
  const [found, user] = await Promise.all([getInvitation(token), getCurrentUser()]);
  const valid = found && !found.invitation.acceptedAt && found.invitation.expiresAt > new Date();
  return (
    <div className="card p-6 sm:p-8">
      {!valid ? (
        <>
          <h1 className="text-xl font-bold">Inbjudan gäller inte längre</h1>
          <p className="mt-2 text-ink-soft">Be den som bjöd in dig att skicka en ny inbjudan.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Bli administratör för {found.accountName}</h1>
          <p className="mt-2 text-ink-soft">Som administratör kan du lägga upp och hantera parkeringsplatser, se bokningar och registrera bilar.</p>
          {fel ? (
            <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              Inbjudan skickades till {found.invitation.email}. Logga in med den adressen för att acceptera.
            </p>
          ) : null}
          {user ? (
            <form action={acceptInvitationAction} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button className="btn-primary btn-lg w-full">Acceptera inbjudan</button>
            </form>
          ) : (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/logga-in?next=/inbjudan/${token}`} className="btn-primary">
                Logga in
              </Link>
              <Link href={`/registrera?next=/inbjudan/${token}`} className="btn-secondary">
                Skapa konto
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
