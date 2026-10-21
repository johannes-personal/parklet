import Link from "next/link";
import { switchAccountAction } from "@/app/(auth)/actions";

/**
 * Shown instead of a bare 404 when a link leads to something the viewer can't
 * see: it was removed, it belongs to another account, or the viewer is signed
 * in with a different account than the one the link was meant for. It doesn't
 * reveal whether the thing exists.
 */
export function Unavailable({
  title,
  children,
  actions = [],
  signedInAs,
  returnTo,
}: {
  title: string;
  children: React.ReactNode;
  actions?: { href: string; label: string }[];
  /** The signed-in user's e-mail, to offer signing in with another account. */
  signedInAs?: string;
  /** Where to come back to after signing in with another account. */
  returnTo?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-3 space-y-2 text-ink-soft">{children}</div>
        {actions.length ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {actions.map((a, i) => (
              <Link key={a.href} href={a.href} className={i === 0 ? "btn-primary" : "btn-secondary"}>
                {a.label}
              </Link>
            ))}
          </div>
        ) : null}
        {signedInAs ? (
          <form action={switchAccountAction} className="mt-6 border-t border-line pt-4 text-sm text-muted">
            <input type="hidden" name="next" value={returnTo ?? "/"} />
            Du är inloggad som <span className="font-medium text-ink-soft">{signedInAs}</span>.{" "}
            <button className="link">Logga in med ett annat konto</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
