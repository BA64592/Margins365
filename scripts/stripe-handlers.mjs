/**
 * Stripe Checkout + webhook helpers for DigitalOcean runtime.
 * v19 subscriptions: Starter / Growth / Pro / Scale × monthly / annual + 14-day trial.
 */
import Stripe from 'stripe'
import {
  recordLegalAcceptance,
  setUserPlan,
  setUserPlanByEmail,
  userFromRequest,
} from './auth-handlers.mjs'
import { dbConfigured, query } from './db.mjs'
import {
  confirmFoundingPlace,
  foundingCouponId,
  releaseFoundingPlace,
  reserveFoundingPlace,
} from './founding.mjs'
import {
  normalizeInterval,
  normalizePlanId,
  planFromPriceId,
  priceIdForPlan,
  stripeTierConfigured,
} from './stripe-price-map.mjs'
import {
  ensureBillingSchema,
  maybeSendPaymentFailedEmail,
  maybeSendTrialReminderEmail,
  maybeSendTrialStartEmail,
} from './billing-handlers.mjs'

const ALLOWED = new Set([
  'GB',
  'US',
  'CA',
  'AU',
  'IE',
  'FR',
  'DE',
  'ES',
  'IT',
  'NL',
  'BE',
  'AT',
  'PT',
  'SE',
  'DK',
  'FI',
  'PL',
  'NZ',
  'CH',
  'NO',
])

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS || 14)
const DEFAULT_ORIGIN =
  process.env.APP_ORIGIN ||
  process.env.VITE_PRODUCT_DOMAIN ||
  'https://margins365.com'

function defaultOriginUrl() {
  const raw = String(DEFAULT_ORIGIN)
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
}

export function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null
  return new Stripe(secret, {
    apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
  })
}

export function stripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      (stripeTierConfigured() ||
        (process.env.STRIPE_PRICE_FULL && process.env.STRIPE_PRICE_EARLY_BIRD)),
  )
}

/**
 * Create Checkout. Identity MUST come from the authenticated session (BUG-023).
 * Call as createCheckoutSession(body, req) — body.accountId/email are ignored when a session exists.
 */
export async function createCheckoutSession(body, req) {
  const stripe = stripeClient()
  if (!stripe) {
    return {
      status: 503,
      body: {
        ok: false,
        message: 'Stripe is not configured (STRIPE_SECRET_KEY). Complete K4 then set secrets.',
      },
    }
  }

  if (dbConfigured()) await ensureBillingSchema()

  let accountId = ''
  let email = ''
  /** @type {Record<string, unknown> | null} */
  let userRow = null
  if (req && dbConfigured()) {
    const user = await userFromRequest(req)
    if (!user) {
      return { status: 401, body: { ok: false, message: 'Sign in to start checkout.' } }
    }
    userRow = user
    accountId = String(user.id)
    email = String(user.email || '')
  } else if (process.env.NODE_ENV === 'production' || dbConfigured()) {
    return {
      status: 401,
      body: { ok: false, message: 'Sign in to start checkout.' },
    }
  } else {
    accountId = String(body.accountId || '')
    email = String(body.email || '')
  }

  const country = String(body.billingCountry || '').toUpperCase()
  if (!ALLOWED.has(country)) {
    return {
      status: 400,
      body: { ok: false, message: "Margins365 isn't available in your country yet." },
    }
  }

  const planId = normalizePlanId(body.planId) || 'pro'
  const interval = normalizeInterval(body.interval)
  const priceId = priceIdForPlan(planId, interval)
  if (!priceId) {
    return {
      status: 503,
      body: {
        ok: false,
        message: `Stripe price not configured for ${planId}/${interval}. Run scripts/stripe-bootstrap-products.mjs and set STRIPE_PRICE_* env vars.`,
      },
    }
  }

  // GA-04 — refuse Checkout when account already has a live subscription
  const liveStates = new Set(['trialing', 'active', 'past_due', 'canceled_access'])
  const licenceState = String(userRow?.licence_state || '').toLowerCase()
  if (userRow && liveStates.has(licenceState)) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'already_subscribed',
        message:
          licenceState === 'canceled_access'
            ? 'You already have a plan ending soon. Use Keep my plan in Plan & billing, or wait until access ends.'
            : 'You already have an active plan. Change plan in Plan & billing instead of starting Checkout again.',
      },
    }
  }
  if (userRow && dbConfigured()) {
    try {
      const listOpts = userRow.stripe_customer_id
        ? { customer: String(userRow.stripe_customer_id), status: 'all', limit: 10 }
        : null
      if (listOpts) {
        const list = await stripe.subscriptions.list(listOpts)
        const live = list.data.find((s) =>
          ['trialing', 'active', 'past_due'].includes(s.status),
        )
        if (live) {
          return {
            status: 409,
            body: {
              ok: false,
              code: 'already_subscribed',
              message:
                'You already have an active plan. Change plan in Plan & billing instead of starting Checkout again.',
            },
          }
        }
      }
    } catch (err) {
      console.warn('[checkout] subscription lookup', err)
    }
  }

  // GA-03 — one trial per account (server). Card fingerprint remains Stripe Dashboard default.
  const trialConsumed = Boolean(
    userRow?.trial_consumed ||
      userRow?.trial_start_email_sent_at ||
      (userRow?.trial_ends_at && String(userRow.licence_state || '') !== 'none'),
  )
  if (trialConsumed) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'trial_used',
        message:
          'This account has already used its free trial. Contact support from Help if you need a paid plan without a second trial.',
      },
    }
  }

  // GA-16 — Checkout requires Terms + Refunds acceptance on this session
  if (userRow && body.acceptLegal) {
    const ip = req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
    await recordLegalAcceptance(accountId, 'checkout', ip)
  } else if (userRow) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'legal_required',
        message: 'Accept the Terms and Refunds policy before Checkout.',
      },
    }
  }

  // K72 — reserve founding place server-side; apply coupon only when reserved
  const wantFounding = body.founding !== false
  let foundingReserved = false
  let foundingPlacesLeft = 0
  if (wantFounding && accountId) {
    const reservation = await reserveFoundingPlace(accountId, planId, interval)
    foundingReserved = Boolean(reservation.reserved)
    foundingPlacesLeft = Number(reservation.placesLeft || 0)
  }

  const origin = defaultOriginUrl()
  // GA-02 / K38 — server always owns trial length; ignore any client trialDays
  const trialDays = TRIAL_DAYS
  const meta = {
    margins365_account_id: accountId,
    marginos_account_id: accountId,
    margins365_plan: planId,
    marginos_plan: planId,
    margins365_interval: interval,
    billing_country: country,
    margins365_founding: foundingReserved ? '1' : '0',
  }

  const discounts = foundingReserved
    ? [{ coupon: foundingCouponId(interval) }]
    : undefined

  // GA-15 — return URLs fixed by server (ignore browser-supplied hosts)
  const base = {
    mode: 'subscription',
    client_reference_id: accountId,
    customer_email: email || undefined,
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancel`,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: meta,
    },
    metadata: meta,
    ...(discounts ? { discounts } : { allow_promotion_codes: false }),
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ...base,
      managed_payments: { enabled: true },
    })
    if (!session.url) {
      return { status: 502, body: { ok: false, message: 'Stripe Checkout Session failed.' } }
    }
    return {
      status: 200,
      body: {
        ok: true,
        url: session.url,
        sessionId: session.id,
        planId,
        interval,
        founding: foundingReserved,
        foundingPlacesLeft,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    // If coupon missing, retry without discount rather than blocking checkout
    if (foundingReserved && /coupon|discount/i.test(String(message))) {
      try {
        const { discounts: _d, ...noDisc } = base
        const session = await stripe.checkout.sessions.create({
          ...noDisc,
          managed_payments: { enabled: true },
        })
        return {
          status: 200,
          body: {
            ok: true,
            url: session.url,
            sessionId: session.id,
            planId,
            interval,
            founding: false,
            foundingPlacesLeft,
            message:
              'Founding coupon not configured in Stripe — checkout continued at full price. Set STRIPE_COUPON_FOUNDING_MONTHLY / STRIPE_COUPON_FOUNDING_ANNUAL.',
          },
        }
      } catch {
        // fall through
      }
    }
    if (String(message).toLowerCase().includes('managed_payments')) {
      try {
        const stripe2 = stripeClient()
        const session = await stripe2.checkout.sessions.create(base)
        return {
          status: 200,
          body: {
            ok: true,
            url: session.url,
            sessionId: session.id,
            planId,
            interval,
            founding: foundingReserved,
            foundingPlacesLeft,
            managedPayments: false,
            message:
              'Checkout created without managed_payments (enable SMP in Stripe Dashboard when eligible).',
          },
        }
      } catch (err2) {
        if (foundingReserved && accountId) await releaseFoundingPlace(accountId)
        return {
          status: 502,
          body: { ok: false, message: err2 instanceof Error ? err2.message : message },
        }
      }
    }
    if (foundingReserved && accountId) await releaseFoundingPlace(accountId)
    return { status: 502, body: { ok: false, message } }
  }
}

/** Fallback in-memory de-dupe when DB is unavailable. */
const seenEvents = new Set()

async function alreadyProcessed(eventId) {
  if (dbConfigured()) {
    const { rows } = await query(`SELECT 1 FROM stripe_events WHERE id = $1`, [eventId])
    return rows.length > 0
  }
  return seenEvents.has(eventId)
}

async function markProcessed(eventId, type) {
  if (dbConfigured()) {
    await query(
      `INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [eventId, type],
    )
    return
  }
  seenEvents.add(eventId)
}

async function applyCheckoutCompleted(session) {
  const accountId =
    session.client_reference_id ||
    session.metadata?.margins365_account_id ||
    session.metadata?.marginos_account_id ||
    ''
  const email = session.customer_details?.email || session.customer_email || ''
  const planId =
    normalizePlanId(session.metadata?.margins365_plan || session.metadata?.marginos_plan) || 'pro'
  // Trial checkouts usually report unpaid until day 15 → trialing; paid → active.
  const licenceState = session.payment_status === 'paid' ? 'active' : 'trialing'
  const billingInterval = normalizeInterval(
    session.metadata?.margins365_interval || session.metadata?.marginos_interval,
  )
  if (accountId) await setUserPlan(accountId, planId, licenceState, billingInterval)
  else if (email) await setUserPlanByEmail(email, planId, licenceState, billingInterval)
  // GA-03 — mark trial consumed as soon as Checkout creates a trial
  if (accountId && licenceState === 'trialing' && dbConfigured()) {
    await query(
      `UPDATE users SET trial_consumed = TRUE, updated_at = NOW() WHERE id = $1`,
      [accountId],
    )
  }
  // K72 — confirm founding reservation once Checkout completes (trial or paid)
  if (accountId && session.metadata?.margins365_founding === '1') {
    if (licenceState === 'active' || licenceState === 'trialing') {
      await confirmFoundingPlace(accountId)
    }
  }
  // K90 — if Checkout created a subscription, send trial-start once confirmed
  if (accountId && email && session.subscription && licenceState === 'trialing') {
    try {
      const client = stripeClient()
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      const sub = await client.subscriptions.retrieve(subId)
      if (dbConfigured()) {
        await query(
          `UPDATE users SET stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
             stripe_customer_id = COALESCE(stripe_customer_id, $3),
             trial_ends_at = COALESCE($4::timestamptz, trial_ends_at),
             updated_at = NOW() WHERE id = $1`,
          [
            accountId,
            sub.id,
            sub.customer ? String(sub.customer) : null,
            sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          ],
        )
      }
      await maybeSendTrialStartEmail({ userId: accountId, email, subscription: sub })
    } catch (err) {
      console.warn('[stripe] trial-start email after checkout', err)
    }
  }
}

async function resolveUserIdFromStripeObject(object) {
  const metaAccount =
    object.metadata?.margins365_account_id || object.metadata?.marginos_account_id || ''
  if (metaAccount) return metaAccount
  if (!dbConfigured()) return null
  const customerId =
    typeof object.customer === 'string'
      ? object.customer
      : object.customer?.id || object.customer || null
  if (customerId) {
    const { rows } = await query(
      `SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1`,
      [String(customerId)],
    )
    if (rows[0]?.id) return rows[0].id
  }
  const email = (
    object.billing_details?.email ||
    object.receipt_email ||
    object.customer_email ||
    ''
  )
    .toLowerCase()
    .trim()
  if (email) {
    const { rows } = await query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email])
    if (rows[0]?.id) return rows[0].id
  }
  return null
}

/** GA-14 — refund / lost dispute ends access and schedules wipe (never plan=free). */
async function applyRefundOrDispute(object, kind = 'refund') {
  const { scheduleAccountDeletion, sendAccessEndedNotice } = await import('./deletion-handlers.mjs')
  const accountId = await resolveUserIdFromStripeObject(object)
  if (!accountId || !dbConfigured()) return
  const { rows } = await query(`SELECT id, email, plan, licence_state FROM users WHERE id = $1`, [
    accountId,
  ])
  const user = rows[0]
  if (!user) return
  const licenceState = kind === 'dispute' ? 'removed_lost_dispute' : 'removed_full_refund'
  // Keep tier plan for audit — never set plan to free (G9)
  await setUserPlan(accountId, normalizePlanId(user.plan) || user.plan || 'pro', licenceState)
  const now = new Date()
  await scheduleAccountDeletion({
    userId: accountId,
    licenceState,
    accessEndsAt: now,
    reason: kind === 'dispute' ? 'lost_dispute' : 'full_refund',
    immediate: true,
    email: user.email,
  })
  if (user.email) {
    await sendAccessEndedNotice(
      user.email,
      now,
      kind === 'dispute' ? 'lost payment dispute' : 'full refund',
    )
  }
  await releaseFoundingPlace(accountId)
}

export async function handleStripeWebhook(rawBody, signature) {
  const stripe = stripeClient()
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !whSecret) {
    return {
      status: 503,
      body: { ok: false, message: 'Webhook secrets not configured (K4).' },
    }
  }
  if (!signature) {
    return { status: 400, body: { ok: false, message: 'Missing stripe-signature' } }
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whSecret)
  } catch (err) {
    return {
      status: 400,
      body: { ok: false, message: err instanceof Error ? err.message : 'Invalid signature' },
    }
  }

  if (await alreadyProcessed(event.id)) {
    return { status: 200, body: { received: true, id: event.id, duplicate: true } }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await applyCheckoutCompleted(event.data.object)
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object
      const accountId =
        sub.metadata?.margins365_account_id || sub.metadata?.marginos_account_id || ''
      const priceId = sub.items?.data?.[0]?.price?.id
      const fromPrice = planFromPriceId(typeof priceId === 'string' ? priceId : priceId?.id)
      // Prefer live Stripe price (K93 scheduled changes) over stale metadata
      const planId =
        fromPrice?.planId ||
        normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan) ||
        'pro'
      const status = sub.status
      let licenceState =
        status === 'trialing'
          ? 'trialing'
          : status === 'active'
            ? 'active'
            : status === 'past_due'
              ? 'past_due'
              : 'canceled'
      // K89 — cancel_at_period_end keeps access until period/trial end
      if (sub.cancel_at_period_end && (status === 'trialing' || status === 'active')) {
        licenceState = 'canceled_access'
      }
      const billingInterval =
        fromPrice?.interval ||
        normalizeInterval(sub.items?.data?.[0]?.price?.recurring?.interval)
      if (accountId) {
        await setUserPlan(accountId, planId, licenceState, billingInterval)
        if (dbConfigured()) {
          await query(
            `UPDATE users SET
               stripe_subscription_id = $2,
               cancel_at_period_end = $3,
               cancel_at = $4,
               trial_ends_at = COALESCE($5::timestamptz, trial_ends_at),
               updated_at = NOW()
             WHERE id = $1`,
            [
              accountId,
              sub.id,
              Boolean(sub.cancel_at_period_end),
              sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
              sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            ],
          )
        }
        // K90 — trial-start email once Stripe confirms trialing
        if (status === 'trialing' && !sub.cancel_at_period_end) {
          let email = ''
          if (dbConfigured()) {
            const { rows } = await query(`SELECT email FROM users WHERE id = $1`, [accountId])
            email = rows[0]?.email || ''
          }
          if (email) {
            await maybeSendTrialStartEmail({ userId: accountId, email, subscription: sub })
          }
        }
      }
    } else if (event.type === 'customer.subscription.created') {
      const sub = event.data.object
      const accountId =
        sub.metadata?.margins365_account_id || sub.metadata?.marginos_account_id || ''
      const planId =
        normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan) || 'pro'
      const billingInterval = normalizeInterval(sub.items?.data?.[0]?.price?.recurring?.interval)
      if (accountId) {
        await setUserPlan(
          accountId,
          planId,
          sub.status === 'trialing' ? 'trialing' : sub.status === 'active' ? 'active' : 'trialing',
          billingInterval,
        )
        if (dbConfigured()) {
          await query(
            `UPDATE users SET stripe_subscription_id = $2,
               stripe_customer_id = COALESCE(stripe_customer_id, $3),
               trial_ends_at = COALESCE($4::timestamptz, trial_ends_at),
               updated_at = NOW() WHERE id = $1`,
            [
              accountId,
              sub.id,
              sub.customer ? String(sub.customer) : null,
              sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            ],
          )
        }
        if (sub.status === 'trialing' && dbConfigured()) {
          const { rows } = await query(`SELECT email FROM users WHERE id = $1`, [accountId])
          const email = rows[0]?.email || ''
          if (email) await maybeSendTrialStartEmail({ userId: accountId, email, subscription: sub })
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const accountId =
        sub.metadata?.margins365_account_id || sub.metadata?.marginos_account_id || ''
      if (accountId) {
        // GA-14 / GA-43 — never plan=free; schedule wipe at period end (or now)
        const { scheduleAccountDeletion } = await import('./deletion-handlers.mjs')
        const ends = sub.ended_at
          ? new Date(sub.ended_at * 1000)
          : sub.cancel_at
            ? new Date(sub.cancel_at * 1000)
            : new Date()
        const planId =
          normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan) || 'pro'
        await setUserPlan(accountId, planId, 'canceled_access')
        await scheduleAccountDeletion({
          userId: accountId,
          licenceState: 'canceled_access',
          accessEndsAt: ends,
          reason: 'subscription_deleted',
          immediate: ends.getTime() <= Date.now(),
        })
        if (sub.status === 'trialing' || sub.metadata?.margins365_founding === '1') {
          await releaseFoundingPlace(accountId)
        }
      }
    } else if (event.type === 'customer.subscription.trial_will_end') {
      // GA-18 — Stripe fires ~3 days before trial end
      const sub = event.data.object
      const accountId =
        sub.metadata?.margins365_account_id || sub.metadata?.marginos_account_id || ''
      if (accountId && dbConfigured() && !sub.cancel_at_period_end) {
        const { rows } = await query(`SELECT email FROM users WHERE id = $1`, [accountId])
        const email = rows[0]?.email || ''
        if (email) {
          await maybeSendTrialReminderEmail({ userId: accountId, email, subscription: sub })
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object
      const accountId =
        inv.subscription_details?.metadata?.margins365_account_id ||
        inv.metadata?.margins365_account_id ||
        inv.metadata?.marginos_account_id ||
        ''
      const finalFailure =
        inv.billing_reason === 'subscription_cycle' && Number(inv.attempt_count || 0) >= 3
      // Release reservation when the first post-trial invoice finally fails
      if (finalFailure && accountId) await releaseFoundingPlace(accountId)
      // GA-20 — SES on each failed charge; final failure ends access messaging
      if (accountId && dbConfigured()) {
        let email = inv.customer_email || ''
        if (!email) {
          const { rows } = await query(`SELECT email FROM users WHERE id = $1`, [accountId])
          email = rows[0]?.email || ''
        }
        if (email) {
          await maybeSendPaymentFailedEmail({
            userId: accountId,
            email,
            invoice: inv,
            finalFailure,
          })
        }
        const failPlan =
          normalizePlanId(inv.subscription_details?.metadata?.margins365_plan) ||
          normalizePlanId(inv.metadata?.margins365_plan) ||
          'pro'
        await setUserPlan(accountId, failPlan, finalFailure ? 'canceled_access' : 'past_due')
      }
    } else if (event.type === 'charge.refunded') {
      await applyRefundOrDispute(event.data.object, 'refund')
    } else if (event.type === 'charge.dispute.closed') {
      const d = event.data.object
      if (d.status === 'lost') await applyRefundOrDispute(d, 'dispute')
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error', err)
    return {
      status: 500,
      body: { ok: false, message: err instanceof Error ? err.message : 'Webhook handler failed' },
    }
  }

  await markProcessed(event.id, event.type)
  console.info('[stripe-webhook]', event.type, event.id)
  return { status: 200, body: { received: true, id: event.id, type: event.type } }
}
