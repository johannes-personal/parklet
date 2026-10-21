// A minimal stand-in for the parts of Stripe Parklet uses: Connect (Express accounts,
// onboarding links, Express dashboard links), Checkout Sessions with destination
// charges, refunds, and signed webhooks to the app. The app's real Stripe code talks to
// it through the official SDK (STRIPE_API_BASE). Object shapes follow Stripe's API.
//
// Run: `node e2e/fake-stripe.mjs` (Playwright starts it), or import startFakeStripe()
// in a test. Test controls live under /__ (see the bottom of the request handler).
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

const id = (prefix) => `${prefix}_test_${randomBytes(12).toString("hex")}`;
const now = () => Math.floor(Date.now() / 1000);
const page = (title, body) =>
  `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;max-width:32rem;margin:2rem auto"><h1>${title}</h1>${body}</body></html>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const NUMBERS = new Set(["amount", "unit_amount", "quantity", "application_fee_amount", "expires_at"]);

/** Stripe's form encoding (`a[b][0][c]=x`) to nested objects and arrays. */
export function parseForm(body) {
  const out = {};
  for (const [key, raw] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, "").split("[");
    let node = out;
    path.forEach((part, i) => {
      const last = i === path.length - 1;
      const nextIsIndex = !last && /^\d*$/.test(path[i + 1]);
      if (last) node[part === "" ? node.length : part] = NUMBERS.has(part) && /^-?\d+$/.test(raw) ? Number(raw) : raw === "true" ? true : raw === "false" ? false : raw;
      else node = node[part] ??= nextIsIndex ? [] : {};
    });
  }
  return out;
}

export function startFakeStripe({
  port = Number(process.env.FAKE_STRIPE_PORT ?? 3104),
  webhookUrl = process.env.FAKE_STRIPE_WEBHOOK_URL ?? null,
  webhookSecret = process.env.FAKE_STRIPE_WEBHOOK_SECRET ?? "whsec_e2e",
  apiKey = process.env.FAKE_STRIPE_API_KEY ?? "sk_test_e2e",
} = {}) {
  const base = `http://localhost:${port}`;
  const state = { accounts: {}, links: {}, sessions: {}, paymentIntents: {}, charges: {}, refunds: {}, events: [], requests: [] };
  const config = { webhooks: true, webhookDelayMs: 150 };
  const idempotent = new Map();

  const sign = (payload, t = now()) => `t=${t},v1=${createHmac("sha256", webhookSecret).update(`${t}.${payload}`).digest("hex")}`;

  /** Records an event and delivers it to the app, signed, like Stripe (unless webhooks are off). */
  function emit(type, object, { account } = {}) {
    const event = { id: id("evt"), object: "event", api_version: "2026-09-30.endive", created: now(), livemode: false, type, data: { object: structuredClone(object) }, ...(account ? { account } : {}) };
    state.events.push(event);
    if (config.webhooks && webhookUrl) setTimeout(() => deliver(event).catch(() => {}), config.webhookDelayMs);
    return event;
  }
  async function deliver(event, { secret } = {}) {
    const payload = JSON.stringify(event);
    const t = now();
    const signature = secret ? `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}` : sign(payload, t);
    const res = await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload });
    return { status: res.status, body: await res.text() };
  }

  /* ------------------------------------------------------------ objects */

  function createAccount(params) {
    const acct = {
      id: id("acct").replace("_test", ""),
      object: "account",
      country: params.country,
      default_currency: params.default_currency,
      email: params.email ?? null,
      business_type: params.business_type ?? null,
      business_profile: params.business_profile ?? {},
      company: params.company ? { name: params.company.name ?? null, tax_id_provided: Boolean(params.company.tax_id) } : undefined,
      individual: params.individual ? { first_name: params.individual.first_name ?? null, last_name: params.individual.last_name ?? null, email: params.individual.email ?? null } : undefined,
      controller: params.controller ?? null,
      capabilities: Object.fromEntries(Object.keys(params.capabilities ?? {}).map((c) => [c, "inactive"])),
      metadata: params.metadata ?? {},
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: { currently_due: ["external_account", "tos_acceptance.date"], eventually_due: ["external_account", "tos_acceptance.date"], past_due: [], disabled_reason: "requirements.past_due" },
      created: now(),
    };
    state.accounts[acct.id] = acct;
    return acct;
  }
  /** What the onboarding page's buttons do to an account. */
  function setAccount(acct, outcome) {
    if (outcome === "active") {
      Object.assign(acct, { details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], eventually_due: [], past_due: [], disabled_reason: null } });
      for (const c of Object.keys(acct.capabilities)) acct.capabilities[c] = "active";
    } else if (outcome === "pending") {
      Object.assign(acct, { details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: [], eventually_due: [], past_due: [], disabled_reason: "requirements.pending_verification" } });
      for (const c of Object.keys(acct.capabilities)) acct.capabilities[c] = "pending";
    } else if (outcome === "restricted") {
      Object.assign(acct, { details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["individual.verification.document"], eventually_due: ["individual.verification.document"], past_due: ["individual.verification.document"], disabled_reason: "requirements.past_due" } });
      for (const c of Object.keys(acct.capabilities)) acct.capabilities[c] = "inactive";
    }
    emit("account.updated", acct, { account: acct.id });
  }

  function createSession(params) {
    const items = params.line_items ?? [];
    const total = items.reduce((sum, li) => sum + li.price_data.unit_amount * (li.quantity ?? 1), 0);
    const session = {
      id: id("cs"),
      object: "checkout.session",
      mode: params.mode,
      locale: params.locale ?? null,
      currency: params.currency ?? items[0]?.price_data.currency ?? null,
      amount_total: total,
      amount_subtotal: total,
      customer_email: params.customer_email ?? null,
      client_reference_id: params.client_reference_id ?? null,
      metadata: params.metadata ?? {},
      expires_at: params.expires_at ?? now() + 24 * 3600,
      success_url: params.success_url,
      cancel_url: params.cancel_url ?? null,
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
      url: null,
      created: now(),
      // Not part of Stripe's object; kept for the test assertions in /__state.
      _line_items: items,
      _payment_intent_data: params.payment_intent_data ?? {},
    };
    session.url = `${base}/checkout/${session.id}`;
    state.sessions[session.id] = session;
    return session;
  }
  const publicSession = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("_")));

  function paySession(session) {
    const data = session._payment_intent_data;
    const chargeId = id("ch");
    const pi = {
      id: id("pi"),
      object: "payment_intent",
      amount: session.amount_total,
      amount_received: session.amount_total,
      currency: session.currency,
      status: "succeeded",
      application_fee_amount: data.application_fee_amount ?? null,
      transfer_data: data.transfer_data ?? null,
      description: data.description ?? null,
      metadata: data.metadata ?? {},
      latest_charge: chargeId,
      created: now(),
    };
    state.paymentIntents[pi.id] = pi;
    state.charges[chargeId] = { id: chargeId, object: "charge", amount: pi.amount, amount_refunded: 0, refunded: false, currency: pi.currency, payment_intent: pi.id, transfer_data: pi.transfer_data, application_fee_amount: pi.application_fee_amount };
    Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: pi.id });
    emit("checkout.session.completed", publicSession(session));
    return pi;
  }

  function expireSession(session) {
    if (session.status !== "open") return false;
    session.status = "expired";
    emit("checkout.session.expired", publicSession(session));
    return true;
  }

  function createRefund(params) {
    const pi = state.paymentIntents[params.payment_intent];
    if (!pi) return [404, error(`No such payment_intent: '${params.payment_intent}'`, "resource_missing")];
    const charge = state.charges[pi.latest_charge];
    const amount = params.amount ?? charge.amount - charge.amount_refunded;
    if (amount > charge.amount - charge.amount_refunded) return [400, error("Refund amount is greater than the unrefunded amount on the charge.", "amount_too_large")];
    const refund = {
      id: id("re"),
      object: "refund",
      amount,
      currency: charge.currency,
      payment_intent: pi.id,
      charge: charge.id,
      status: "succeeded",
      reason: params.reason ?? null,
      metadata: params.metadata ?? {},
      created: now(),
      // Not part of Stripe's object: what the refund reversed, for assertions.
      _reverse_transfer: params.reverse_transfer === true,
      _refund_application_fee: params.refund_application_fee === true,
    };
    state.refunds[refund.id] = refund;
    charge.amount_refunded += amount;
    charge.refunded = charge.amount_refunded >= charge.amount;
    emit("charge.refunded", charge);
    return [200, refund];
  }

  const error = (message, code, type = "invalid_request_error") => ({ error: { type, code, message } });

  /* ------------------------------------------------------------ server */

  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });
  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const html = (res, body, status = 200) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  };
  const redirect = (res, location) => {
    res.writeHead(303, { Location: location });
    res.end();
  };

  async function api(req, res, url) {
    if (req.headers.authorization !== `Bearer ${apiKey}`) return send(res, 401, error("Invalid API Key provided", "api_key_invalid", "authentication_error"));
    const body = req.method === "POST" ? parseForm(await readBody(req)) : {};
    state.requests.push({ method: req.method, path: url.pathname, body, idempotencyKey: req.headers["idempotency-key"] ?? null });
    const key = req.headers["idempotency-key"];
    const remember = (status, out) => {
      if (key && req.method === "POST") idempotent.set(`${url.pathname}:${key}`, [status, out]);
      send(res, status, out);
    };
    if (key && idempotent.has(`${url.pathname}:${key}`)) return send(res, ...idempotent.get(`${url.pathname}:${key}`));
    const p = url.pathname.split("/").filter(Boolean); // ["v1", …]

    if (p[1] === "accounts" && p.length === 2 && req.method === "POST") return remember(200, createAccount(body));
    if (p[1] === "accounts" && p.length === 3 && req.method === "GET") {
      const acct = state.accounts[p[2]];
      return acct ? send(res, 200, acct) : send(res, 404, error(`No such account: '${p[2]}'`, "resource_missing"));
    }
    if (p[1] === "accounts" && p[3] === "login_links" && req.method === "POST") {
      if (!state.accounts[p[2]]) return send(res, 404, error(`No such account: '${p[2]}'`, "resource_missing"));
      return send(res, 200, { object: "login_link", created: now(), url: `${base}/express/${p[2]}` });
    }
    if (p[1] === "account_links" && req.method === "POST") {
      if (!state.accounts[body.account]) return send(res, 404, error(`No such account: '${body.account}'`, "resource_missing"));
      const token = randomBytes(12).toString("hex");
      state.links[token] = { account: body.account, return_url: body.return_url, refresh_url: body.refresh_url, used: false, collection_options: body.collection_options ?? null };
      return send(res, 200, { object: "account_link", created: now(), expires_at: now() + 300, url: `${base}/connect/onboarding/${token}` });
    }
    if (p[1] === "checkout" && p[2] === "sessions" && p.length === 3 && req.method === "POST") {
      if (body.expires_at && body.expires_at < now() + 30 * 60) return send(res, 400, error("The `expires_at` timestamp must be at least 30 minutes from Checkout Session creation.", "parameter_invalid_integer"));
      const destination = body.payment_intent_data?.transfer_data?.destination;
      if (destination && !destination.startsWith("acct_")) return send(res, 400, error(`No such destination: '${destination}'`, "resource_missing"));
      // Accounts made here must have finished onboarding; others (the seed's) are taken as connected.
      if (destination && state.accounts[destination] && !state.accounts[destination].charges_enabled) {
        return send(res, 400, error("The destination account needs to have the transfers capability enabled.", "insufficient_capabilities_for_transfer"));
      }
      return remember(200, publicSession(createSession(body)));
    }
    if (p[1] === "checkout" && p[2] === "sessions" && p.length === 4 && req.method === "GET") {
      const s = state.sessions[p[3]];
      return s ? send(res, 200, publicSession(s)) : send(res, 404, error(`No such checkout.session: '${p[3]}'`, "resource_missing"));
    }
    if (p[1] === "checkout" && p[2] === "sessions" && p[4] === "expire" && req.method === "POST") {
      const s = state.sessions[p[3]];
      if (!s) return send(res, 404, error(`No such checkout.session: '${p[3]}'`, "resource_missing"));
      if (!expireSession(s)) return send(res, 400, error(`Only Checkout Sessions with a status in [open] can be expired. This Checkout Session has a status of ${s.status}.`, "checkout_session_not_open"));
      return send(res, 200, publicSession(s));
    }
    if (p[1] === "refunds" && p.length === 2 && req.method === "POST") return remember(...createRefund(body));
    send(res, 404, error(`Unrecognized request URL (${req.method}: ${url.pathname}).`, "unrecognized_url"));
  }

  async function browser(req, res, url) {
    const p = url.pathname.split("/").filter(Boolean);
    // Hosted Checkout.
    if (p[0] === "checkout" && p[1]) {
      const s = state.sessions[p[1]];
      if (!s) return html(res, page("Sidan finns inte", ""), 404);
      if (req.method === "POST") {
        const form = new URLSearchParams(await readBody(req));
        if (s.status !== "open" || s.expires_at < now()) return html(res, page("Betalningssidan har gått ut", ""), 410);
        if (form.get("outcome") === "decline") return html(res, checkoutPage(s, "Kortet nekades. Försök med ett annat kort."));
        paySession(s);
        return redirect(res, s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id));
      }
      if (s.status !== "open") return html(res, page("Betalningssidan har gått ut", `<p>Status: ${s.status}</p>`), 410);
      return html(res, checkoutPage(s));
    }
    // Connect onboarding (an account link is single-use: a second visit goes to refresh_url).
    if (p[0] === "connect" && p[1] === "onboarding" && p[2]) {
      const link = state.links[p[2]];
      if (!link) return html(res, page("Länken finns inte", ""), 404);
      const acct = state.accounts[link.account];
      if (req.method === "POST") {
        const outcome = new URLSearchParams(await readBody(req)).get("outcome");
        if (outcome !== "leave") setAccount(acct, outcome);
        return redirect(res, link.return_url);
      }
      if (link.used) return redirect(res, link.refresh_url);
      link.used = true;
      const name = acct.company?.name ?? [acct.individual?.first_name, acct.individual?.last_name].filter(Boolean).join(" ");
      const button = (outcome, label) => `<form method="post"><input type="hidden" name="outcome" value="${outcome}"><button>${label}</button></form>`;
      return html(
        res,
        page(
          "Fake Stripe Connect",
          `<p>Konto ${esc(acct.id)} (${esc(acct.business_type)}, ${esc(acct.country)})</p><p>E-post: ${esc(acct.email)}</p><p>Namn: ${esc(name)}</p>` +
            button("active", "Skicka in uppgifter") +
            button("pending", "Skicka in, granskas") +
            button("restricted", "Skicka in utan ID-handling") +
            button("leave", "Avbryt registreringen"),
        ),
      );
    }
    if (p[0] === "express" && p[1]) return html(res, page("Fake Stripe Express", `<p>Utbetalningar för ${esc(p[1])}</p>`));
    html(res, page("Sidan finns inte", ""), 404);
  }

  function checkoutPage(s, message = "") {
    const rows = s._line_items.map((li) => `<li>${esc(li.price_data.product_data?.name)}: ${(li.price_data.unit_amount / 100).toFixed(2)} kr</li>`).join("");
    return page(
      "Fake Stripe Checkout",
      `<ul>${rows}</ul><p>Totalt: <strong data-testid="checkout-total">${(s.amount_total / 100).toFixed(2)} kr</strong></p>` +
        (message ? `<p role="alert">${esc(message)}</p>` : "") +
        `<form method="post"><input type="hidden" name="outcome" value="pay"><button>Betala</button></form>` +
        `<form method="post"><input type="hidden" name="outcome" value="decline"><button>Betala med nekat kort</button></form>` +
        (s.cancel_url ? `<a href="${esc(s.cancel_url)}">Tillbaka</a>` : ""),
    );
  }

  /** Test controls: state, settings, and the things only Stripe can make happen. */
  async function control(req, res, url) {
    const p = url.pathname.split("/").filter(Boolean); // ["__", …]
    const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : {};
    if (p[1] === "state") return send(res, 200, state);
    if (p[1] === "config" && req.method === "POST") return send(res, 200, Object.assign(config, body));
    if (p[1] === "sessions" && p[3] === "expire") {
      const s = state.sessions[p[2]];
      return s && expireSession(s) ? send(res, 200, publicSession(s)) : send(res, 404, {});
    }
    if (p[1] === "sessions" && p[3] === "pay") {
      const s = state.sessions[p[2]];
      if (!s || s.status !== "open") return send(res, 404, {});
      paySession(s);
      return send(res, 200, publicSession(s));
    }
    if (p[1] === "accounts" && p[3]) {
      const acct = state.accounts[p[2]];
      if (!acct) return send(res, 404, {});
      setAccount(acct, p[3]);
      return send(res, 200, acct);
    }
    // Delivers the event again (Stripe's at-least-once), or as signed by another secret.
    if (p[1] === "events" && p[3] === "deliver") {
      const event = state.events.find((e) => e.id === p[2]);
      return event && webhookUrl ? send(res, 200, await deliver(event, body)) : send(res, 404, {});
    }
    send(res, 404, {});
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    try {
      if (url.pathname === "/health") return send(res, 200, { ok: true });
      if (url.pathname.startsWith("/v1/")) return await api(req, res, url);
      if (url.pathname.startsWith("/__/")) return await control(req, res, url);
      return await browser(req, res, url);
    } catch (err) {
      send(res, 500, error(String(err), "fake_error", "api_error"));
    }
  });
  const listening = new Promise((resolve) => server.listen(port, resolve));
  return {
    url: base,
    state,
    config,
    listening,
    emit,
    deliver,
    sign,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const fake = startFakeStripe();
  fake.listening.then(() => console.log(`fake Stripe on ${fake.url}`));
}
