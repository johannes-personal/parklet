import "server-only";
import { api, embed, fromDb, must, names, rpc } from "@/db/api";
import { hostAccountMembers, hostAccounts, spots, users, type HostAccount, type HostKind, type PayoutStatus, type Spot } from "@/db/schema";

/**
 * Search and filters for Parklet's admins: every spot and every host
 * account, with the facts a reviewer or support person needs in the list.
 * The queries are Postgres functions (0010_http_api.sql).
 */

export const PAGE_SIZE = 50;

export type SpotFilters = {
  q?: string;
  review?: "draft" | "pending_review" | "approved" | "rejected";
  basis?: "owns" | "brf" | "landlord";
  city?: string;
  bookable?: "yes" | "no";
  sort?: "updated" | "submitted" | "title" | "bookings";
  page?: number;
};

export type AdminSpotRow = Pick<Spot, "id" | "title" | "address" | "city" | "review" | "rightBasis" | "landlordKind" | "submittedAt" | "updatedAt"> & {
  accountId: string;
  accountName: string;
  accountKind: HostKind;
  bookable: boolean;
  /** Why an approved spot can't be booked right now, or null. */
  notBookable: string | null;
  upcoming: number;
  total: number;
};

type SpotSearchResult = {
  rows: (Record<string, unknown> & { account_id: string; account_name: string; account_kind: HostKind; bookable: boolean; not_bookable: string | null; upcoming: number; total: number })[];
  total: number;
  by_review: Record<string, number>;
  cities: { city: string; n: number }[];
};

export async function searchSpots(f: SpotFilters) {
  const page = Math.max(1, f.page ?? 1);
  const result = await rpc<SpotSearchResult>("parklet_admin_search_spots", {
    p_q: f.q?.trim() || null,
    p_review: f.review ?? null,
    p_basis: f.basis ?? null,
    p_city: f.city ?? null,
    p_bookable: f.bookable ?? null,
    p_sort: f.sort ?? "updated",
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows: AdminSpotRow[] = result.rows.map((r) => ({
    ...fromDb<typeof spots, Pick<Spot, "id" | "title" | "address" | "city" | "review" | "rightBasis" | "landlordKind" | "submittedAt" | "updatedAt">>(spots, r),
    accountId: r.account_id,
    accountName: r.account_name,
    accountKind: r.account_kind,
    bookable: r.bookable,
    notBookable: r.not_bookable,
    upcoming: r.upcoming,
    total: r.total,
  }));
  return { rows, total: result.total, page, byReview: result.by_review, cities: result.cities };
}

export type AccountFilters = {
  q?: string;
  kind?: "household" | "association" | "company";
  verification?: "unverified" | "pending" | "verified" | "rejected";
  payout?: PayoutStatus;
  sort?: "created" | "name" | "spots";
  page?: number;
};

type AccountSearchResult = {
  rows: { account: Record<string, unknown>; spots: number; approved: number }[];
  total: number;
  by_verification: Record<string, number>;
};

export async function searchAccounts(f: AccountFilters) {
  const page = Math.max(1, f.page ?? 1);
  const result = await rpc<AccountSearchResult>("parklet_admin_search_accounts", {
    p_q: f.q?.trim() || null,
    p_kind: f.kind ?? null,
    p_verification: f.verification ?? null,
    p_payout: f.payout ?? null,
    p_sort: f.sort ?? "created",
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = result.rows.map((r) => ({ account: fromDb<typeof hostAccounts, HostAccount>(hostAccounts, r.account), spots: r.spots, approved: r.approved }));

  // Owners, with whether they have verified themselves with BankID.
  const M = names(hostAccountMembers);
  const owners = rows.length
    ? must<{ accountId: string; user: { name: string; email: string; identityVerifiedAt: string | null } }[]>(
        await api()
          .from("host_account_members")
          .select(`accountId:${M.hostAccountId},${embed("user", users, ["name", "email", "identityVerifiedAt"], { inner: true })}`)
          .in(M.hostAccountId, rows.map((r) => r.account.id))
          .eq(M.role, "owner"),
        "searchAccounts",
      ).map((o) => ({ accountId: o.accountId, name: o.user.name, email: o.user.email, verified: o.user.identityVerifiedAt != null }))
    : [];
  const ownerOf = new Map(owners.map((o) => [o.accountId, o]));
  return {
    rows: rows.map((r) => ({ ...r, owner: ownerOf.get(r.account.id) ?? null })),
    total: result.total,
    page,
    byVerification: result.by_verification,
  };
}
