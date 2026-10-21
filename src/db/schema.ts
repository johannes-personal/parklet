import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  jsonb,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lower-cased and trimmed. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    /**
     * Set when the person has proven their identity with an e-ID (BankID
     * through Idura). Only hosts go through this: DAC7 requires reporting
     * sellers' TIN (personnummer) to Skatteverket, so it is kept, encrypted
     * with IDENTITY_ENCRYPTION_KEY. Drivers' personnummer is never stored.
     */
    identityVerifiedAt: ts("identity_verified_at"),
    identityProvider: text("identity_provider"),
    /** The e-ID broker's stable pseudonym for the person (`sub`). */
    identityRef: text("identity_ref"),
    /** Name as stated by the e-ID. */
    identityName: text("identity_name"),
    /** AES-256-GCM, see src/lib/crypto.ts. */
    personnummerEncrypted: text("personnummer_encrypted"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/**
 * In-flight e-ID logins: the OIDC state, nonce and PKCE verifier between
 * redirecting to the broker and its callback. Rows live for ten minutes.
 */
export const identityRequests = pgTable("identity_requests", {
  state: text("state").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nonce: text("nonce").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  next: text("next").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Normalised: upper case, no spaces. */
    reg: text("reg").notNull(),
    nickname: text("nickname").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("vehicles_user_reg_key").on(t.userId, t.reg)],
);

/* ---------------------------------------------------------- host accounts */

/**
 * A hosting account ("uthyrarkonto") owns spots and receives payouts. A
 * household account belongs to one person; associations (BRF) and companies
 * can have several administrators.
 */
export const hostKindEnum = pgEnum("host_kind", ["household", "association", "company"]);
export const verificationStatusEnum = pgEnum("verification_status", ["unverified", "pending", "verified", "rejected"]);
/**
 * Mirrors the host's Stripe connected account (src/server/payouts.ts):
 * not_connected (no account yet), onboarding (started, details not submitted),
 * pending (submitted, Stripe is verifying), restricted (Stripe needs more
 * information, or has disabled the account), active (charges and payouts enabled).
 */
export const payoutStatusEnum = pgEnum("payout_status", ["not_connected", "onboarding", "pending", "restricted", "active"]);

export const hostAccounts = pgTable("host_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: hostKindEnum("kind").notNull(),
  name: text("name").notNull(),
  /** Swedish organisationsnummer (NNNNNN-NNNN) for associations and companies. */
  orgNumber: text("org_number"),
  /** What the person who created the account says their mandate is, e.g. "Styrelseledamot". */
  signatoryRole: text("signatory_role"),
  /** Result of the lookup at Bolagsverket when the account was created (null: not checked). */
  registryCheckedAt: ts("registry_checked_at"),
  registryName: text("registry_name"),
  registryForm: text("registry_form"),
  /** "active" | "liquidation" (deregistered organisations are refused). */
  registryStatus: text("registry_status"),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  reviewNote: text("review_note"),
  reviewedAt: ts("reviewed_at"),
  /** Payout account: the Stripe connected account (acct_…), or a mock ref. Payouts require completed KYC. */
  payoutStatus: payoutStatusEnum("payout_status").notNull().default("not_connected"),
  payoutAccountRef: text("payout_account_ref"),
  createdAt: createdAt(),
});

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin"]);

export const hostAccountMembers = pgTable(
  "host_account_members",
  {
    hostAccountId: uuid("host_account_id")
      .notNull()
      .references(() => hostAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.hostAccountId, t.userId] }), index("host_account_members_user_idx").on(t.userId)],
);

export const hostInvitations = pgTable("host_invitations", {
  /** SHA-256 of the invitation token. */
  id: text("id").primaryKey(),
  hostAccountId: uuid("host_account_id")
    .notNull()
    .references(() => hostAccounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ spots */

export const spotTypeEnum = pgEnum("spot_type", ["outdoor", "garage", "carport", "driveway"]);
export const spotStatusEnum = pgEnum("spot_status", ["active", "paused"]);
export const spotVisibilityEnum = pgEnum("spot_visibility", ["public", "link"]);
/** The host's legal basis for renting the spot out. */
export const rightBasisEnum = pgEnum("right_basis", ["owns", "rents"]);
/** Who the host rents the spot from, when basis = rents. */
export const landlordKindEnum = pgEnum("landlord_kind", ["brf", "landlord"]);
export const spotReviewEnum = pgEnum("spot_review", ["draft", "pending_review", "approved", "rejected"]);
export const landlordApprovalEnum = pgEnum("landlord_approval", ["not_needed", "missing", "requested", "approved", "declined"]);

export const spots = pgTable(
  "spots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostAccountId: uuid("host_account_id")
      .notNull()
      .references(() => hostAccounts.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    address: text("address").notNull(),
    city: text("city").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    spotType: spotTypeEnum("spot_type").notNull(),
    covered: boolean("covered").notNull().default(false),
    evCharging: boolean("ev_charging").notNull().default(false),
    maxHeightCm: integer("max_height_cm"),

    pricePerHourOre: integer("price_per_hour_ore").notNull(),
    pricePerDayOre: integer("price_per_day_ore"),
    minDurationMinutes: integer("min_duration_minutes").notNull().default(60),
    /** Bookings must be made at least this long before they start. */
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(0),
    /** Drivers can cancel for free until this many hours before start. */
    cancellationHours: integer("cancellation_hours").notNull().default(2),
    /** Only revealed to drivers with a confirmed booking. */
    accessInstructions: text("access_instructions").notNull().default(""),
    visibility: spotVisibilityEnum("visibility").notNull().default("public"),
    /** The host's schedule definition (see src/lib/schedule.ts); availability_windows is derived from it. */
    schedule: jsonb("schedule").$type<import("@/lib/schedule").Schedule>().notNull().default({ mode: "always" }),
    /** Host-controlled on/off switch. */
    status: spotStatusEnum("status").notNull().default("active"),

    /** Right to rent out ("uthyrningsrätt"). */
    rightBasis: rightBasisEnum("right_basis").notNull(),
    landlordKind: landlordKindEnum("landlord_kind"),
    landlordName: text("landlord_name"),
    landlordEmail: text("landlord_email"),
    landlordApproval: landlordApprovalEnum("landlord_approval").notNull().default("not_needed"),
    landlordApprovalTokenHash: text("landlord_approval_token_hash"),
    landlordApprovedByName: text("landlord_approved_by_name"),
    landlordApprovedByRole: text("landlord_approved_by_role"),
    landlordRespondedAt: ts("landlord_responded_at"),

    /** e.g. the BRF requires temporary renters' cars to be registered in its parking system. */
    requiresVehicleRegistration: boolean("requires_vehicle_registration").notNull().default(false),
    /** Set when the landlord or BRF required registration in its approval; the host can't switch it off. */
    landlordRequiresRegistration: boolean("landlord_requires_registration").notNull().default(false),
    vehicleRegistrationNote: text("vehicle_registration_note").notNull().default(""),

    review: spotReviewEnum("review").notNull().default("draft"),
    reviewNote: text("review_note"),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: ts("submitted_at"),

    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("spots_lat_lng_idx").on(t.lat, t.lng),
    index("spots_host_account_idx").on(t.hostAccountId),
    index("spots_review_idx").on(t.review),
    uniqueIndex("spots_landlord_token_key").on(t.landlordApprovalTokenHash),
    check("spots_price_positive", sql`${t.pricePerHourOre} > 0`),
    check("spots_day_price_positive", sql`${t.pricePerDayOre} IS NULL OR ${t.pricePerDayOre} > 0`),
    check("spots_lat_range", sql`${t.lat} BETWEEN -90 AND 90`),
    check("spots_lng_range", sql`${t.lng} BETWEEN -180 AND 180`),
    check("spots_landlord_kind", sql`(${t.rightBasis} = 'rents') = (${t.landlordKind} IS NOT NULL)`),
  ],
);

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: serial("id").primaryKey(),
    spotId: uuid("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    /** ISO weekday, 1 = Monday … 7 = Sunday. */
    weekday: smallint("weekday").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
  },
  (t) => [
    index("availability_windows_spot_id_idx").on(t.spotId),
    check("availability_weekday_range", sql`${t.weekday} BETWEEN 1 AND 7`),
    check(
      "availability_minutes_range",
      sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.startMinute} < ${t.endMinute}`,
    ),
  ],
);

/* -------------------------------------------------------------- documents */

export const documentKindEnum = pgEnum("document_kind", [
  // Right to rent out a spot
  "ownership_proof",
  "rental_contract",
  "sublet_permission",
  "landlord_rules",
  // Organisation verification
  "org_registration",
  "board_minutes",
  "signatory_proof",
  "other",
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostAccountId: uuid("host_account_id")
      .notNull()
      .references(() => hostAccounts.id, { onDelete: "cascade" }),
    /** Null for organisation-level documents. */
    spotId: uuid("spot_id").references(() => spots.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: documentKindEnum("kind").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Opaque key in the private document store. Never served publicly. */
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("documents_host_account_idx").on(t.hostAccountId), index("documents_spot_idx").on(t.spotId)],
);

/**
 * Document bytes for the "database" storage driver (used on Vercel, where the
 * filesystem is not persistent). Production should move to a private
 * Supabase Storage / S3 bucket; see src/server/storage.ts.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const documentBlobs = pgTable("document_blobs", {
  storageKey: text("storage_key").primaryKey(),
  bytes: bytea("bytes").notNull(),
  createdAt: createdAt(),
});

/** Outgoing e-mail when no mail provider is configured (development and the demo deployment). */
export const mailOutbox = pgTable("mail_outbox", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  html: text("html"),
  createdAt: createdAt(),
});

/* --------------------------------------------------------------- bookings */

export const bookingStatusEnum = pgEnum("booking_status", ["pending_payment", "confirmed", "cancelled", "expired"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "paid", "refunded"]);
export const cancelledByEnum = pgEnum("cancelled_by", ["driver", "host"]);
export const vehicleRegistrationEnum = pgEnum("vehicle_registration", ["not_required", "pending", "done"]);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spotId: uuid("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    status: bookingStatusEnum("status").notNull().default("pending_payment"),
    /** A pending booking holds the slot until this time, then expires. */
    holdExpiresAt: ts("hold_expires_at"),
    /** Snapshot of the plate at booking time. */
    vehicleReg: text("vehicle_reg").notNull(),
    vehicleRegistration: vehicleRegistrationEnum("vehicle_registration").notNull().default("not_required"),
    vehicleRegisteredAt: ts("vehicle_registered_at"),
    /** Registration follow-up (src/server/reminders.ts): the host's reminder, and the driver's warning at the start time. */
    vehicleReminderSentAt: ts("vehicle_reminder_sent_at"),
    vehicleOverdueNotifiedAt: ts("vehicle_overdue_notified_at"),
    baseOre: integer("base_ore").notNull(),
    feeOre: integer("fee_ore").notNull(),
    totalOre: integer("total_ore").notNull(),
    paymentProvider: text("payment_provider").notNull(),
    /** The charge: Stripe's PaymentIntent (pi_…) once paid, or the mock's ref. Refunds go through it. */
    paymentRef: text("payment_ref"),
    /** Stripe Checkout Session (cs_…) the driver pays through; its expiry is the hold's. */
    checkoutSessionId: text("checkout_session_id"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
    createdAt: createdAt(),
    confirmedAt: ts("confirmed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: cancelledByEnum("cancelled_by"),
  },
  (t) => [
    index("bookings_spot_id_idx").on(t.spotId, t.startsAt),
    index("bookings_driver_id_idx").on(t.driverId, t.startsAt),
    uniqueIndex("bookings_checkout_session_key").on(t.checkoutSessionId),
    index("bookings_payment_ref_idx").on(t.paymentRef),
    check("bookings_range_valid", sql`${t.endsAt} > ${t.startsAt}`),
    // The exclusion constraint that makes double booking impossible lives in
    // a custom migration (drizzle-kit cannot express EXCLUDE constraints):
    // see src/db/migrations/0001_no_double_booking.sql
  ],
);

/**
 * Secrets the database shares with the app, e.g. the token the database's own
 * scheduler (pg_cron) sends to /api/cron/paminnelser. Generated inside the
 * database, so it never has to be copied anywhere.
 */
export const appSecrets = pgTable("app_secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
});

/**
 * Stripe webhook events that have been handled, so a redelivered event is
 * acknowledged without running again. Handlers are idempotent on their own as
 * well; this saves the API calls and notifications a second run would repeat.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  createdAt: createdAt(),
});

/** In-app notifications (the bell in the header). Most are also sent by e-mail. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** In-app path the notification links to. */
    href: text("href").notNull(),
    createdAt: createdAt(),
    readAt: ts("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type HostAccount = typeof hostAccounts.$inferSelect;
export type Spot = typeof spots.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type SpotType = (typeof spotTypeEnum.enumValues)[number];
export type HostKind = (typeof hostKindEnum.enumValues)[number];
export type PayoutStatus = (typeof payoutStatusEnum.enumValues)[number];
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
