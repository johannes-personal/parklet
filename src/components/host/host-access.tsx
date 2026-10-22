import { Unavailable } from "@/components/unavailable";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * A host page opened by someone who isn't an administrator of the account,
 * typically through a link sent to the account's administrators (e-mail, the
 * bell, the admin outbox). Parklet's admins get a link to the admin view.
 */
export function NoAccountAccess({ user, accountId, spotId, returnTo }: { user: CurrentUser; accountId: string; spotId?: string; returnTo: string }) {
  return (
    <Unavailable
      title="Du har inte tillgång till sidan"
      signedInAs={user.email}
      returnTo={returnTo}
      actions={
        user.isAdmin
          ? [{ href: spotId ? `/admin/platser/${spotId}` : `/admin/konton/${accountId}`, label: spotId ? "Öppna platsen i administrationen" : "Öppna kontot i administrationen" }]
          : [{ href: "/uthyrare", label: "Till din uthyrning" }]
      }
    >
      <p>Sidan hör till ett uthyrarkonto som du inte är administratör för, eller så finns kontot inte längre.</p>
      {user.isAdmin ? <p>Som granskare på Parklet ser du kontot och dess parkeringsplatser i administrationen.</p> : null}
    </Unavailable>
  );
}

/** A spot of the account that no longer exists (or the link is wrong). */
export function SpotGone({ accountId, accountName }: { accountId: string; accountName: string }) {
  return (
    <Unavailable title="Platsen finns inte" actions={[{ href: `/uthyrare/${accountId}`, label: `Till ${accountName}` }]}>
      <p>Platsen har tagits bort, eller så är länken fel.</p>
    </Unavailable>
  );
}
