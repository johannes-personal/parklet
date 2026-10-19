import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, hostAccountMembers, hostAccounts, spots, users } from "@/db/schema";

/**
 * Search and filters for Parklet's admins: every spot and every host
 * account, with the facts a reviewer or support person needs in the list.
 */

export const PAGE_SIZE = 50;

// Correlated subqueries name the outer row's id explicitly: Drizzle leaves column
// names unqualified in single-table queries, where they would resolve to the subquery's own table.
const ACCOUNT_ID = sql.raw(`"host_accounts"."id"`);
const SPOT_ID = sql.raw(`"spots"."id"`);

/** Free-text match: escapes LIKE wildcards so "%" and "_" are searched literally. */
function like(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type SpotFilters = {
  q?: string;
  review?: "draft" | "pending_review" | "approved" | "rejected";
  basis?: "owns" | "brf" | "landlord";
  city?: string;
  bookable?: "yes" | "no";
  sort?: "updated" | "submitted" | "title" | "bookings";
  page?: number;
};

/** Why a spot can't be booked right now, or null when it can. */
const notBookableReason = sql<string | null>`case
  when ${spots.review} <> 'approved' then null
  when ${spots.status} = 'paused' then 'Pausad av uthyraren'
  when ${hostAccounts.verificationStatus} <> 'verified' then 'Kontot är inte verifierat'
  when ${hostAccounts.payoutStatus} <> 'active' then 'Utbetalning saknas'
  else null end`;
const isBookable = sql<boolean>`(${spots.review} = 'approved' and ${spots.status} = 'active' and ${hostAccounts.verificationStatus} = 'verified' and ${hostAccounts.payoutStatus} = 'active')`;

export async function searchSpots(f: SpotFilters) {
  const where: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const term = like(q);
    where.push(
      or(
        ilike(spots.title, term),
        ilike(spots.address, term),
        ilike(spots.city, term),
        ilike(hostAccounts.name, term),
        ilike(hostAccounts.orgNumber, term),
        ilike(spots.landlordName, term),
        sql`${spots.id}::text ilike ${`${q.replace(/[^0-9a-f-]/gi, "")}%`}`,
      )!,
    );
  }
  if (f.basis === "owns") where.push(eq(spots.rightBasis, "owns"));
  if (f.basis === "brf" || f.basis === "landlord") where.push(and(eq(spots.rightBasis, "rents"), eq(spots.landlordKind, f.basis))!);
  if (f.city) where.push(eq(spots.city, f.city));
  if (f.bookable === "yes") where.push(isBookable);
  if (f.bookable === "no") where.push(sql`not ${isBookable}`);
  // Status counts ignore the status filter itself, so the chips show what each would give.
  const base = where.length ? and(...where) : undefined;
  const filtered = f.review ? and(base, eq(spots.review, f.review)) : base;

  const upcoming = sql<number>`(select count(*) from ${bookings} b where b.spot_id = ${SPOT_ID} and b.status = 'confirmed' and b.ends_at > now())`.mapWith(Number);
  const total = sql<number>`(select count(*) from ${bookings} b where b.spot_id = ${SPOT_ID} and b.status = 'confirmed')`.mapWith(Number);
  const order = {
    updated: [desc(spots.updatedAt)],
    submitted: [sql`${spots.submittedAt} desc nulls last`],
    title: [asc(spots.title)],
    bookings: [desc(total), desc(spots.updatedAt)],
  }[f.sort ?? "updated"];
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ n }], byReview, cities] = await Promise.all([
    db
      .select({
        id: spots.id,
        title: spots.title,
        address: spots.address,
        city: spots.city,
        review: spots.review,
        rightBasis: spots.rightBasis,
        landlordKind: spots.landlordKind,
        submittedAt: spots.submittedAt,
        updatedAt: spots.updatedAt,
        accountId: hostAccounts.id,
        accountName: hostAccounts.name,
        accountKind: hostAccounts.kind,
        bookable: isBookable,
        notBookable: notBookableReason,
        upcoming,
        total,
      })
      .from(spots)
      .innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId))
      .where(filtered)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(spots).innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId)).where(filtered),
    db.select({ review: spots.review, n: count() }).from(spots).innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId)).where(base).groupBy(spots.review),
    db.select({ city: spots.city, n: count() }).from(spots).groupBy(spots.city).orderBy(asc(spots.city)),
  ]);
  return { rows, total: n, page, byReview: Object.fromEntries(byReview.map((r) => [r.review, r.n])) as Record<string, number>, cities };
}

export type AccountFilters = {
  q?: string;
  kind?: "household" | "association" | "company";
  verification?: "unverified" | "pending" | "verified" | "rejected";
  payout?: "active" | "not_connected";
  sort?: "created" | "name" | "spots";
  page?: number;
};

export async function searchAccounts(f: AccountFilters) {
  const where: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const term = like(q);
    const digits = q.replace(/\D/g, "");
    where.push(
      or(
        ilike(hostAccounts.name, term),
        ilike(hostAccounts.registryName, term),
        ...(digits.length >= 4 ? [sql`regexp_replace(${hostAccounts.orgNumber}, '\\D', '', 'g') like ${`%${digits}%`}`] : []),
        // Members by name or e-mail.
        sql`exists (select 1 from ${hostAccountMembers} m join ${users} u on u.id = m.user_id
                    where m.host_account_id = ${ACCOUNT_ID} and (u.name ilike ${term} or u.email ilike ${term}))`,
      )!,
    );
  }
  if (f.kind) where.push(eq(hostAccounts.kind, f.kind));
  if (f.payout) where.push(eq(hostAccounts.payoutStatus, f.payout));
  const base = where.length ? and(...where) : undefined;
  const filtered = f.verification ? and(base, eq(hostAccounts.verificationStatus, f.verification)) : base;

  const spotCount = sql<number>`(select count(*) from ${spots} s where s.host_account_id = ${ACCOUNT_ID})`.mapWith(Number);
  const approvedCount = sql<number>`(select count(*) from ${spots} s where s.host_account_id = ${ACCOUNT_ID} and s.review = 'approved')`.mapWith(Number);
  const order = { created: [desc(hostAccounts.createdAt)], name: [asc(hostAccounts.name)], spots: [desc(spotCount), asc(hostAccounts.name)] }[f.sort ?? "created"];
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ n }], byVerification] = await Promise.all([
    db
      .select({ account: hostAccounts, spots: spotCount, approved: approvedCount })
      .from(hostAccounts)
      .where(filtered)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(hostAccounts).where(filtered),
    db.select({ status: hostAccounts.verificationStatus, n: count() }).from(hostAccounts).where(base).groupBy(hostAccounts.verificationStatus),
  ]);

  // Owners, with whether they have verified themselves with BankID.
  const owners = rows.length
    ? await db
        .select({ accountId: hostAccountMembers.hostAccountId, name: users.name, email: users.email, verified: sql<boolean>`${users.identityVerifiedAt} is not null` })
        .from(hostAccountMembers)
        .innerJoin(users, eq(users.id, hostAccountMembers.userId))
        .where(and(inArray(hostAccountMembers.hostAccountId, rows.map((r) => r.account.id)), eq(hostAccountMembers.role, "owner")))
    : [];
  const ownerOf = new Map(owners.map((o) => [o.accountId, o]));
  return {
    rows: rows.map((r) => ({ ...r, owner: ownerOf.get(r.account.id) ?? null })),
    total: n,
    page,
    byVerification: Object.fromEntries(byVerification.map((r) => [r.status, r.n])) as Record<string, number>,
  };
}
