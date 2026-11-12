/**
 * K89 / K90 / K93 — cancel, trial-start email, plan-change (Stripe + SES).
 */
import { randomBytes } from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import Stripe from 'stripe'
import { userFromRequest } from './auth-handlers.mjs'
import { dbConfigured, query } from './db.mjs'
import {
  normalizeInterval,
  normalizePlanId,
  PLAN_RANK,
  planFromPriceId,
  priceIdForPlan,
} from './stripe-price-map.mjs'

const ORDER_LIMITS = { starter: 500, growth: 2000, pro: 5000, scale: 15000 }

function planNameOf(planId) {
  const id = normalizePlanId(planId) || 'pro'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

const APP_ORIGIN = (
  process.env.APP_ORIGIN ||
  process.env.VITE_PRODUCT_DOMAIN ||
  'https://margins365.com'
).replace(/\/$/, '')
const ORIGIN_URL = APP_ORIGIN.startsWith('http') ? APP_ORIGIN : `https://${APP_ORIGIN}`
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'info.marginos@gmail.com'

function stripe() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null
  return new Stripe(secret, {
    apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
  })
}

function sesCfg() {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = process.env.SES_FROM_ADDRESS || process.env.SES_FROM_EMAIL
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!from || !accessKeyId || !secretAccessKey) return null
  return { region, from, accessKeyId, secretAccessKey }
}

async function sendMail(to, subject, text, html, replyTo) {
  const cfg = sesCfg()
  if (!cfg) return { ok: false, message: 'SES is not configured.' }
  const client = new SESv2Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  /** @type {Record<string, unknown>} */
  const input = {
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    },
  }
  if (replyTo) input.ReplyToAddresses = [String(replyTo)]
  await client.send(new SendEmailCommand(input))
  return { ok: true }
}

function londonStamp(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(d) + ' Europe/London'
}

function moneyFromStripe(amount, currency = 'gbp') {
  if (amount == null) return '—'
  const n = Number(amount) / 100
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(currency || 'gbp').toUpperCase(),
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `£${n.toFixed(2)}`
  }
}

export async function ensureBillingSchema() {
  if (!dbConfigured()) return
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_reference TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start_email_sent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_consumed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_email_sent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_failed_email_sent_at TIMESTAMPTZ;
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS billing_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      plan_id TEXT,
      stripe_subscription_id TEXT,
      cancel_at TIMESTAMPTZ,
      reference TEXT,
      detail TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS billing_audit_user_id_idx ON billing_audit(user_id);
  `)
}

async function audit(userId, action, fields = {}) {
  if (!dbConfigured()) return
  await ensureBillingSchema()
  await query(
    `INSERT INTO billing_audit (id, user_id, action, plan_id, stripe_subscription_id, cancel_at, reference, detail, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      randomBytes(12).toString('hex'),
      userId,
      action,
      fields.planId || null,
      fields.subscriptionId || null,
      fields.cancelAt || null,
      fields.reference || null,
      fields.detail || null,
      fields.ip || null,
    ],
  )
}

async function findSubscriptionForUser(client, user) {
  await ensureBillingSchema()
  if (user.stripe_subscription_id) {
    try {
      return await client.subscriptions.retrieve(user.stripe_subscription_id)
    } catch {
      /* fall through */
    }
  }
  let customerId = user.stripe_customer_id || null
  if (!customerId) {
    const sessions = await client.checkout.sessions.list({ limit: 40, status: 'complete' })
    const hit = sessions.data.find((s) => {
      const e = (s.customer_details?.email || s.customer_email || '').toLowerCase()
      const ref =
        s.client_reference_id ||
        s.metadata?.margins365_account_id ||
        s.metadata?.marginos_account_id ||
        ''
      return (e === String(user.email || '').toLowerCase() || ref === user.id) && s.subscription
    })
    if (hit?.subscription) {
      const subId = typeof hit.subscription === 'string' ? hit.subscription : hit.subscription.id
      const sub = await client.subscriptions.retrieve(subId)
      if (sub.customer) {
        await query(
          `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2),
             stripe_subscription_id = COALESCE(stripe_subscription_id, $3), updated_at = NOW()
           WHERE id = $1`,
          [user.id, String(sub.customer), sub.id],
        )
      }
      return sub
    }
  }
  if (!customerId) return null
  const list = await client.subscriptions.list({
    customer: String(customerId),
    status: 'all',
    limit: 10,
  })
  const live =
    list.data.find((s) => s.status === 'trialing' || s.status === 'active') ||
    list.data.find((s) => s.cancel_at_period_end) ||
    list.data[0] ||
    null
  if (live) {
    await query(
      `UPDATE users SET stripe_subscription_id = $2, updated_at = NOW() WHERE id = $1`,
      [user.id, live.id],
    )
  }
  return live
}

/**
 * Stripe Node SDK 19+ / API 2025-03-31+ removed invoices.retrieveUpcoming.
 * Use invoices.createPreview; treat "no upcoming" as null (expected after trial cancel).
 */
async function upcomingInvoiceSafe(client, subscriptionId, customerId) {
  const params = { customer: customerId, subscription: subscriptionId }
  try {
    if (typeof client.invoices?.createPreview === 'function') {
      return await client.invoices.createPreview(params)
    }
    // Older SDKs only — keep a soft fallback while deploys roll.
    if (typeof client.invoices?.retrieveUpcoming === 'function') {
      return await client.invoices.retrieveUpcoming(params)
    }
    return null
  } catch (err) {
    // Stripe throws when there is no upcoming invoice (desired after cancel_at_period_end on trial)
    const msg = err instanceof Error ? err.message : String(err)
    if (
      /no upcoming invoices|No upcoming invoices/i.test(msg) ||
      err?.code === 'invoice_upcoming_none'
    ) {
      return null
    }
    throw err
  }
}

/** K89 — POST /api/billing/cancel */
export async function handleBillingCancel(req, body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const client = stripe()
  if (!client) return { status: 503, body: { ok: false, message: 'Stripe is not configured.' } }

  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  const reason = String(body?.reason || '').slice(0, 80) || null
  const note = String(body?.note || '').slice(0, 500) || null
  const reference = `CXL-${randomBytes(4).toString('hex').toUpperCase()}`

  let sub
  try {
    sub = await findSubscriptionForUser(client, user)
  } catch (err) {
    await audit(user.id, 'cancel_failed', { detail: String(err), ip, reference })
    return {
      status: 502,
      body: {
        ok: false,
        message: 'We couldn’t cancel your subscription. Nothing has changed. Please try again.',
        code: 'stripe_lookup_failed',
      },
    }
  }

  if (!sub || !['trialing', 'active', 'past_due'].includes(sub.status)) {
    await audit(user.id, 'cancel_failed', { detail: 'no_active_subscription', ip, reference })
    return {
      status: 409,
      body: { ok: false, message: 'No active trial or subscription to cancel.', code: 'none' },
    }
  }

  const wasTrial = sub.status === 'trialing'
  const planId =
    normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan || user.plan) ||
    'pro'
  const chargeHint = sub.trial_end
    ? new Date(sub.trial_end * 1000)
    : sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : null

  try {
    await audit(user.id, 'cancel_requested', {
      planId,
      subscriptionId: sub.id,
      ip,
      reference,
      detail: JSON.stringify({ reason, note }),
    })

    const updated = await client.subscriptions.update(
      sub.id,
      { cancel_at_period_end: true },
      { idempotencyKey: `cancel:${user.id}:${sub.id}` },
    )

    const checked = await client.subscriptions.retrieve(updated.id)
    const upcoming = await upcomingInvoiceSafe(client, checked.id, String(checked.customer))
    const okFlag =
      (checked.cancel_at_period_end === true || checked.status === 'canceled') &&
      (wasTrial ? !upcoming : true)

    if (!okFlag) {
      await audit(user.id, 'cancel_failed', {
        planId,
        subscriptionId: checked.id,
        ip,
        reference,
        detail: 'stripe_check_failed',
      })
      return {
        status: 502,
        body: {
          ok: false,
          kind: wasTrial ? 'trial' : 'subscription',
          chargeDate: chargeHint ? londonStamp(chargeHint) : null,
          message: `We couldn’t cancel your ${wasTrial ? 'trial' : 'subscription'}. Nothing has changed — you will still be charged on ${chargeHint ? londonStamp(chargeHint) : 'the next billing date'} unless you cancel. Please try again.`,
        },
      }
    }

    const accessUntil = checked.cancel_at
      ? new Date(checked.cancel_at * 1000)
      : checked.trial_end
        ? new Date(checked.trial_end * 1000)
        : checked.current_period_end
          ? new Date(checked.current_period_end * 1000)
          : null

    await query(
      `UPDATE users SET
         licence_state = 'canceled_access',
         plan = $2,
         stripe_subscription_id = $3,
         stripe_customer_id = COALESCE(stripe_customer_id, $4),
         cancel_at = $5,
         cancel_reference = $6,
         cancel_at_period_end = TRUE,
         trial_ends_at = COALESCE(trial_ends_at, $7),
         updated_at = NOW()
       WHERE id = $1`,
      [
        user.id,
        planId,
        checked.id,
        checked.customer ? String(checked.customer) : null,
        accessUntil ? accessUntil.toISOString() : null,
        reference,
        checked.trial_end ? new Date(checked.trial_end * 1000).toISOString() : null,
      ],
    )

    // GA-42 — schedule wipe at access end (no free plan)
    if (accessUntil) {
      const { scheduleAccountDeletion } = await import('./deletion-handlers.mjs')
      await scheduleAccountDeletion({
        userId: user.id,
        licenceState: 'canceled_access',
        accessEndsAt: accessUntil,
        reason: wasTrial ? 'cancel_trial' : 'cancel_subscription',
        immediate: false,
        email: user.email,
      })
    }

    await audit(user.id, 'cancel_confirmed', {
      planId,
      subscriptionId: checked.id,
      cancelAt: accessUntil ? accessUntil.toISOString() : null,
      reference,
      ip,
      detail: 'no_upcoming_invoice',
    })

    const accessLabel = accessUntil ? londonStamp(accessUntil) : 'the end of your access period'
    const planName = planId.charAt(0).toUpperCase() + planId.slice(1)
    const subject = wasTrial
      ? 'Your Margins365 trial is cancelled — you won’t be charged'
      : 'Your Margins365 subscription is cancelled'
    const text = [
      wasTrial
        ? `Your ${planName} trial is cancelled. You will not be charged.`
        : `Your ${planName} subscription is cancelled. No further payments will be taken.`,
      `Reference: ${reference}`,
      `Cancelled: ${londonStamp()}`,
      `You keep access until ${accessLabel}.`,
      `On that date your account closes and your data is permanently deleted — download it before then: ${ORIGIN_URL}/account/billing`,
      `To keep the plan before then, open Plan & billing and choose Resubscribe / Keep my plan.`,
      '',
      '— Margins365',
    ].join('\n')
    const html = `<p>${wasTrial ? `Your <strong>${planName}</strong> trial is cancelled. You will not be charged.` : `Your <strong>${planName}</strong> subscription is cancelled. No further payments will be taken.`}</p><p>Reference: <strong>${reference}</strong></p><p>Cancelled: ${londonStamp()}</p><p>You keep access until <strong>${accessLabel}</strong>.</p><p>On that date your account closes and your data is permanently deleted — <a href="${ORIGIN_URL}/account/billing">download it before then</a>.</p><p>To keep the plan before then, open Plan &amp; billing and choose Resubscribe / Keep my plan.</p><p>— Margins365</p>`
    const mail = await sendMail(user.email, subject, text, html, CONTACT_INBOX)
    if (!mail.ok) {
      await audit(user.id, 'cancel_email_failed', {
        planId,
        subscriptionId: checked.id,
        reference,
        detail: mail.message,
        ip,
      })
    } else {
      await audit(user.id, 'cancel_email_sent', {
        planId,
        subscriptionId: checked.id,
        reference,
        ip,
      })
    }

    return {
      status: 200,
      body: {
        ok: true,
        kind: wasTrial ? 'trial' : 'subscription',
        planId,
        planName,
        reference,
        accessUntil: accessUntil ? accessUntil.toISOString() : null,
        accessUntilLabel: accessLabel,
        email: user.email,
        stripeLine: accessUntil
          ? `Stripe: cancels on ${accessLabel}, no upcoming invoice`
          : 'Stripe: cancelled',
        title: wasTrial ? 'Your trial is cancelled' : 'Your subscription is cancelled',
        body: wasTrial
          ? `Your ${planName} trial is cancelled. You won’t be charged. You keep access until ${accessLabel}. On that date your account closes and your data is permanently deleted — download it before then. Reference: ${reference}. We’ve emailed a confirmation to ${user.email}.`
          : `Your ${planName} subscription is cancelled. No further payments will be taken. You keep access until ${accessLabel}. On that date your account closes and your data is permanently deleted — download it before then. Reference: ${reference}. We’ve emailed a confirmation to ${user.email}.`,
      },
    }
  } catch (err) {
    await audit(user.id, 'cancel_failed', {
      planId,
      subscriptionId: sub?.id,
      reference,
      detail: err instanceof Error ? err.message : String(err),
      ip,
    })
    return {
      status: 502,
      body: {
        ok: false,
        kind: wasTrial ? 'trial' : 'subscription',
        chargeDate: chargeHint ? londonStamp(chargeHint) : null,
        message: `We couldn’t cancel your ${wasTrial ? 'trial' : 'subscription'}. Nothing has changed — you will still be charged on ${chargeHint ? londonStamp(chargeHint) : 'the next billing date'} unless you cancel. Please try again.`,
      },
    }
  }
}

/** K89 — POST /api/billing/resubscribe */
export async function handleBillingResubscribe(req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const client = stripe()
  if (!client) return { status: 503, body: { ok: false, message: 'Stripe is not configured.' } }
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'

  let sub
  try {
    sub = await findSubscriptionForUser(client, user)
  } catch (err) {
    await audit(user.id, 'resubscribe_failed', { detail: String(err), ip })
    return {
      status: 502,
      body: { ok: false, message: 'We couldn’t keep your plan. Nothing has changed. Please try again.' },
    }
  }

  if (!sub || !sub.cancel_at_period_end) {
    return {
      status: 409,
      body: {
        ok: false,
        message: 'Nothing to keep — this plan is not scheduled to end.',
        code: 'none',
      },
    }
  }
  if (sub.cancel_at && sub.cancel_at * 1000 < Date.now()) {
    return {
      status: 409,
      body: { ok: false, message: 'Access has already ended. Start again from Checkout.' },
    }
  }

  try {
    const updated = await client.subscriptions.update(
      sub.id,
      { cancel_at_period_end: false },
      { idempotencyKey: `resub:${user.id}:${sub.id}` },
    )
    if (updated.cancel_at_period_end) {
      await audit(user.id, 'resubscribe_failed', {
        subscriptionId: updated.id,
        detail: 'stripe_still_canceling',
        ip,
      })
      return {
        status: 502,
        body: {
          ok: false,
          message: 'We couldn’t keep your plan. Nothing has changed. Please try again.',
        },
      }
    }

    const planId =
      normalizePlanId(updated.metadata?.margins365_plan || updated.metadata?.marginos_plan || user.plan) ||
      'pro'
    const licenceState = updated.status === 'trialing' ? 'trialing' : 'active'
    await query(
      `UPDATE users SET
         licence_state = $2,
         plan = $3,
         cancel_at = NULL,
         cancel_reference = NULL,
         cancel_at_period_end = FALSE,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, licenceState, planId],
    )
    const { clearScheduledDeletion } = await import('./deletion-handlers.mjs')
    await clearScheduledDeletion(user.id)
    await audit(user.id, 'resubscribed', { planId, subscriptionId: updated.id, ip })

    const planName = planId.charAt(0).toUpperCase() + planId.slice(1)
    const message = `You’ve kept your ${planName} plan. The end date is unchanged — no new trial starts.`
    const mail = await sendMail(
      user.email,
      'Your Margins365 plan will continue',
      `${message}\n\n— Margins365\n`,
      `<p>${message.replace(`You’ve kept your ${planName} plan`, `You’ve kept your <strong>${planName}</strong> plan`)}</p><p>— Margins365</p>`,
      CONTACT_INBOX,
    )
    if (!mail.ok) {
      await audit(user.id, 'resubscribe_email_failed', {
        planId,
        subscriptionId: updated.id,
        detail: mail.message,
        ip,
      })
    }

    return {
      status: 200,
      body: {
        ok: true,
        planId,
        licenceState,
        title: 'You’re keeping your plan',
        message,
      },
    }
  } catch (err) {
    await audit(user.id, 'resubscribe_failed', {
      subscriptionId: sub?.id,
      detail: err instanceof Error ? err.message : String(err),
      ip,
    })
    return {
      status: 502,
      body: {
        ok: false,
        message: 'We couldn’t keep your plan. Nothing has changed. Please try again.',
      },
    }
  }
}

/** K90 — send trial-start email once after Stripe confirms trialing. */
export async function maybeSendTrialStartEmail({ userId, email, subscription }) {
  if (!dbConfigured() || !userId || !email || !subscription) return { sent: false }
  await ensureBillingSchema()
  const { rows } = await query(`SELECT trial_start_email_sent_at, plan FROM users WHERE id = $1`, [
    userId,
  ])
  if (!rows[0] || rows[0].trial_start_email_sent_at) return { sent: false, reason: 'already' }
  if (subscription.status !== 'trialing') return { sent: false, reason: 'not_trialing' }

  const planId =
    normalizePlanId(subscription.metadata?.margins365_plan || subscription.metadata?.marginos_plan) ||
    normalizePlanId(rows[0].plan) ||
    'pro'
  const planName = planId.charAt(0).toUpperCase() + planId.slice(1)
  const interval = normalizeInterval(subscription.items?.data?.[0]?.price?.recurring?.interval) || 'month'
  const price = subscription.items?.data?.[0]?.price
  const unit = price?.unit_amount
  const currency = price?.currency || 'gbp'
  const amountLabel = moneyFromStripe(unit, currency)
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  const trialStart = subscription.start_date
    ? new Date(subscription.start_date * 1000)
    : new Date()
  const founding = subscription.metadata?.margins365_founding === '1'
  const orderLimits = { starter: 500, growth: 2000, pro: 5000, scale: 15000 }
  const limit = orderLimits[planId] || 500
  const reference = `TRIAL-${subscription.id.slice(-8).toUpperCase()}`

  const subject = `Your Margins365 ${planName} trial has started`
  const text = [
    `Your 14-day free trial of ${planName} has started.`,
    `Plan: ${planName} (${interval === 'year' ? 'annual' : 'monthly'})`,
    `Trial started: ${londonStamp(trialStart)}`,
    `Trial ends: ${trialEnd ? londonStamp(trialEnd) : '—'}`,
    `Unless you cancel, we’ll charge ${amountLabel} including VAT on ${trialEnd ? londonStamp(trialEnd) : 'day 15'}${founding ? ' (founding rate for the first period, then the normal price)' : ''}.`,
    `Your plan includes ${limit.toLocaleString('en-GB')} unique orders a month.`,
    `Cancel any time before the trial ends in Plan & billing — one click. Replying to this email does not cancel.`,
    `We’ll email a reminder a few days before you’re charged.`,
    `Reference: ${reference}`,
    `Terms: ${ORIGIN_URL}/legal/terms`,
    '',
    '— Margins365',
  ].join('\n')
  const html = `<p>Your 14-day free trial of <strong>${planName}</strong> has started.</p><ul><li>Plan: ${planName} (${interval === 'year' ? 'annual' : 'monthly'})</li><li>Trial started: ${londonStamp(trialStart)}</li><li>Trial ends: ${trialEnd ? londonStamp(trialEnd) : '—'}</li><li>Unless you cancel, we’ll charge <strong>${amountLabel}</strong> including VAT on ${trialEnd ? londonStamp(trialEnd) : 'day 15'}${founding ? ' (founding rate for the first period, then the normal price)' : ''}.</li><li>Order limit: ${limit.toLocaleString('en-GB')} / month</li></ul><p>Cancel any time before the trial ends in <a href="${ORIGIN_URL}/account/billing">Plan &amp; billing</a> — one click. Replying does not cancel.</p><p>Reference: ${reference}</p><p><a href="${ORIGIN_URL}/legal/terms">Terms</a></p><p>— Margins365</p>`

  const mail = await sendMail(email, subject, text, html, CONTACT_INBOX)
  if (!mail.ok) {
    await audit(userId, 'trial_start_email_failed', {
      planId,
      subscriptionId: subscription.id,
      detail: mail.message,
      reference,
    })
    return { sent: false, reason: 'ses_failed' }
  }
  await query(
    `UPDATE users SET trial_start_email_sent_at = NOW(),
       trial_consumed = TRUE,
       stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
       trial_ends_at = COALESCE($3::timestamptz, trial_ends_at),
       updated_at = NOW()
     WHERE id = $1 AND trial_start_email_sent_at IS NULL`,
    [userId, subscription.id, trialEnd ? trialEnd.toISOString() : null],
  )
  await audit(userId, 'trial_start_email_sent', {
    planId,
    subscriptionId: subscription.id,
    reference,
  })
  return {
    sent: true,
    planId,
    planName,
    amountLabel,
    trialEndsAt: trialEnd ? trialEnd.toISOString() : null,
    trialEndsLabel: trialEnd ? londonStamp(trialEnd) : null,
    reference,
    email,
    limit,
  }
}

/** GA-18 — one reminder ~3 days before trial end (Stripe trial_will_end). */
export async function maybeSendTrialReminderEmail({ userId, email, subscription }) {
  if (!dbConfigured() || !userId || !email || !subscription) return { sent: false }
  await ensureBillingSchema()
  if (subscription.cancel_at_period_end || subscription.status !== 'trialing') {
    return { sent: false, reason: 'not_trialing_or_cancelled' }
  }
  const { rows } = await query(
    `SELECT trial_reminder_email_sent_at, plan, cancel_at_period_end FROM users WHERE id = $1`,
    [userId],
  )
  if (!rows[0] || rows[0].trial_reminder_email_sent_at) return { sent: false, reason: 'already' }
  if (rows[0].cancel_at_period_end) return { sent: false, reason: 'cancelled' }

  const planId =
    normalizePlanId(subscription.metadata?.margins365_plan || subscription.metadata?.marginos_plan) ||
    normalizePlanId(rows[0].plan) ||
    'pro'
  const planName = planNameOf(planId)
  const price = subscription.items?.data?.[0]?.price
  const amountLabel = moneyFromStripe(price?.unit_amount, price?.currency)
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  const reference = `REM-${subscription.id.slice(-8).toUpperCase()}`

  const subject = `Your Margins365 ${planName} trial ends soon`
  const text = [
    `Your free trial of ${planName} ends on ${trialEnd ? londonStamp(trialEnd) : 'the trial end date'}.`,
    `Unless you cancel in Plan & billing, we’ll charge ${amountLabel} including VAT then.`,
    `Cancel any time before then — one click. Replying to this email does not cancel.`,
    `Plan & billing: ${ORIGIN_URL}/account/billing`,
    `Reference: ${reference}`,
    '',
    '— Margins365',
  ].join('\n')
  const html = `<p>Your free trial of <strong>${planName}</strong> ends on <strong>${trialEnd ? londonStamp(trialEnd) : 'the trial end date'}</strong>.</p><p>Unless you cancel in Plan &amp; billing, we’ll charge <strong>${amountLabel}</strong> including VAT then.</p><p><a href="${ORIGIN_URL}/account/billing">Cancel in Plan &amp; billing</a> — one click. Replying does not cancel.</p><p>Reference: ${reference}</p><p>— Margins365</p>`

  const mail = await sendMail(email, subject, text, html, CONTACT_INBOX)
  if (!mail.ok) {
    await audit(userId, 'trial_reminder_email_failed', {
      planId,
      subscriptionId: subscription.id,
      detail: mail.message,
      reference,
    })
    return { sent: false, reason: 'ses_failed' }
  }
  await query(
    `UPDATE users SET trial_reminder_email_sent_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND trial_reminder_email_sent_at IS NULL`,
    [userId],
  )
  await audit(userId, 'trial_reminder_email_sent', {
    planId,
    subscriptionId: subscription.id,
    reference,
  })
  return { sent: true, reference }
}

/** GA-20 — payment failed / final failure email. */
export async function maybeSendPaymentFailedEmail({
  userId,
  email,
  invoice,
  finalFailure = false,
}) {
  if (!dbConfigured() || !userId || !email || !invoice) return { sent: false }
  await ensureBillingSchema()
  const attempt = Number(invoice.attempt_count || 1)
  const amountLabel = moneyFromStripe(invoice.amount_due, invoice.currency)
  const reference = `PAYFAIL-${String(invoice.id || '').slice(-8).toUpperCase() || randomBytes(4).toString('hex').toUpperCase()}`
  const subject = finalFailure
    ? 'Margins365 payment failed — access ending'
    : 'Margins365 payment failed — update your card'
  const text = finalFailure
    ? [
        `We couldn’t take your Margins365 payment of ${amountLabel} including VAT after several attempts.`,
        `Access will end and your data will be scheduled for deletion. Download anything you need from Plan & billing.`,
        `Update card / billing: ${ORIGIN_URL}/account/billing`,
        `Reference: ${reference}`,
        '',
        '— Margins365',
      ].join('\n')
    : [
        `We couldn’t take your Margins365 payment of ${amountLabel} including VAT (attempt ${attempt}).`,
        `Please update your card in Plan & billing so your plan continues.`,
        `Update card: ${ORIGIN_URL}/account/billing`,
        `Reference: ${reference}`,
        '',
        '— Margins365',
      ].join('\n')
  const html = finalFailure
    ? `<p>We couldn’t take your Margins365 payment of <strong>${amountLabel}</strong> including VAT after several attempts.</p><p>Access will end and your data will be scheduled for deletion. Download anything you need from <a href="${ORIGIN_URL}/account/billing">Plan &amp; billing</a>.</p><p>Reference: ${reference}</p><p>— Margins365</p>`
    : `<p>We couldn’t take your Margins365 payment of <strong>${amountLabel}</strong> including VAT (attempt ${attempt}).</p><p><a href="${ORIGIN_URL}/account/billing">Update your card in Plan &amp; billing</a> so your plan continues.</p><p>Reference: ${reference}</p><p>— Margins365</p>`

  const mail = await sendMail(email, subject, text, html, CONTACT_INBOX)
  if (!mail.ok) {
    await audit(userId, 'payment_failed_email_failed', {
      detail: mail.message,
      reference,
      subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    })
    return { sent: false, reason: 'ses_failed' }
  }
  await query(
    `UPDATE users SET
       payment_failed_email_sent_at = NOW(),
       licence_state = CASE WHEN $2 THEN 'past_due' ELSE licence_state END,
       updated_at = NOW()
     WHERE id = $1`,
    [userId, !finalFailure],
  )
  if (finalFailure) {
    await query(
      `UPDATE users SET licence_state = 'canceled_access', updated_at = NOW() WHERE id = $1`,
      [userId],
    )
  }
  await audit(userId, finalFailure ? 'payment_final_failure_email_sent' : 'payment_failed_email_sent', {
    reference,
    detail: JSON.stringify({ attempt, amount: invoice.amount_due, finalFailure }),
    subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
  })
  return { sent: true, reference, finalFailure }
}

/**
 * K93 / GA-08 — POST /api/billing/change-plan
 * Body: { planId, interval }
 * Trial / paid upgrade (same interval): immediate.
 * Paid downgrade or interval change: at renewal via subscription schedule.
 */
export async function handleBillingChangePlan(req, body) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const client = stripe()
  if (!client) return { status: 503, body: { ok: false, message: 'Stripe is not configured.' } }

  const newPlanId = normalizePlanId(body?.planId)
  const newInterval = normalizeInterval(body?.interval)
  if (!newPlanId) {
    return { status: 400, body: { ok: false, message: 'Choose a valid plan.' } }
  }
  const newPriceId = priceIdForPlan(newPlanId, newInterval)
  if (!newPriceId) {
    return {
      status: 503,
      body: {
        ok: false,
        message: `Stripe price not configured for ${newPlanId}/${newInterval}.`,
      },
    }
  }

  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'local'
  const reference = `CHG-${randomBytes(4).toString('hex').toUpperCase()}`

  let sub
  try {
    sub = await findSubscriptionForUser(client, user)
  } catch (err) {
    await audit(user.id, 'plan_change_failed', { detail: String(err), ip, reference })
    return {
      status: 502,
      body: { ok: false, message: 'We couldn’t change your plan. Nothing has changed. Please try again.' },
    }
  }

  if (!sub || !['trialing', 'active', 'past_due'].includes(sub.status)) {
    return {
      status: 409,
      body: { ok: false, message: 'No active trial or subscription to change.', code: 'none' },
    }
  }
  if (sub.cancel_at_period_end) {
    return {
      status: 409,
      body: {
        ok: false,
        message: 'Keep your plan first (Resubscribe), then change plan.',
        code: 'cancel_pending',
      },
    }
  }

  const item = sub.items?.data?.[0]
  if (!item?.id || !item.price?.id) {
    return { status: 502, body: { ok: false, message: 'Subscription item missing in Stripe.' } }
  }

  const oldFromPrice = planFromPriceId(item.price.id)
  const oldPlanId =
    normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan || user.plan) ||
    oldFromPrice?.planId ||
    'pro'
  const oldInterval =
    normalizeInterval(item.price?.recurring?.interval || user.billing_interval) ||
    oldFromPrice?.interval ||
    'month'

  if (oldPlanId === newPlanId && oldInterval === newInterval) {
    return {
      status: 409,
      body: { ok: false, message: 'You are already on that plan and billing interval.' },
    }
  }

  const isTrial = sub.status === 'trialing'
  const rankUp =
    oldInterval === newInterval && (PLAN_RANK[newPlanId] || 0) > (PLAN_RANK[oldPlanId] || 0)
  const immediate = isTrial || rankUp
  const effectiveAt = immediate
    ? new Date()
    : sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : new Date()

  const metaBase = {
    ...(sub.metadata || {}),
    margins365_account_id: sub.metadata?.margins365_account_id || user.id,
    margins365_plan: immediate ? newPlanId : oldPlanId,
    margins365_interval: immediate ? newInterval : oldInterval,
  }

  let updated = sub
  let prorationPence = 0
  let prorationLabel = 'None'

  try {
    if (immediate) {
      updated = await client.subscriptions.update(
        sub.id,
        {
          items: [{ id: item.id, price: newPriceId }],
          proration_behavior: isTrial ? 'none' : 'create_prorations',
          metadata: {
            ...metaBase,
            margins365_plan: newPlanId,
            margins365_interval: newInterval,
            margins365_pending_plan: '',
            margins365_pending_interval: '',
          },
          ...(isTrial && sub.trial_end ? { trial_end: sub.trial_end } : {}),
        },
        { idempotencyKey: `chg:${user.id}:${sub.id}:${newPlanId}:${newInterval}:${immediate}` },
      )
      if (!isTrial) {
        try {
          const upcoming = await upcomingInvoiceSafe(
            client,
            updated.id,
            String(updated.customer),
          )
          if (upcoming) {
            const lines = (upcoming.lines?.data || []).filter((l) => l.proration)
            prorationPence = lines.reduce((sum, l) => sum + Number(l.amount || 0), 0)
            if (prorationPence !== 0) {
              prorationLabel = `${moneyFromStripe(prorationPence, upcoming.currency)} (prorated adjustment)`
            }
          }
        } catch {
          /* optional */
        }
      }
    } else {
      // Paid downgrade or interval change — apply at renewal via schedule
      let scheduleId =
        typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id || null
      if (!scheduleId) {
        const created = await client.subscriptionSchedules.create({
          from_subscription: sub.id,
        })
        scheduleId = created.id
      }
      const schedule = await client.subscriptionSchedules.retrieve(scheduleId)
      const phase0 = schedule.phases[0]
      const endDate = phase0.end_date || sub.current_period_end
      const currentItems = (phase0.items || []).map((phItem) => ({
        price: typeof phItem.price === 'string' ? phItem.price : phItem.price.id,
        quantity: phItem.quantity || 1,
      }))
      await client.subscriptionSchedules.update(scheduleId, {
        end_behavior: 'release',
        phases: [
          {
            start_date: phase0.start_date,
            end_date: endDate,
            items: currentItems,
            proration_behavior: 'none',
          },
          {
            start_date: endDate,
            items: [{ price: newPriceId, quantity: 1 }],
            proration_behavior: 'none',
            metadata: {
              margins365_account_id: user.id,
              margins365_plan: newPlanId,
              margins365_interval: newInterval,
              margins365_pending_plan: '',
              margins365_pending_interval: '',
            },
          },
        ],
      })
      updated = await client.subscriptions.update(sub.id, {
        metadata: {
          ...metaBase,
          margins365_pending_plan: newPlanId,
          margins365_pending_interval: newInterval,
        },
      })
      prorationLabel = 'None — change takes effect at renewal (no charge today)'
    }
  } catch (err) {
    await audit(user.id, 'plan_change_failed', {
      planId: newPlanId,
      subscriptionId: sub.id,
      detail: String(err),
      ip,
      reference,
    })
    return {
      status: 502,
      body: {
        ok: false,
        message: 'We couldn’t change your plan. Nothing has changed. Please try again.',
        code: 'stripe_update_failed',
      },
    }
  }

  const newPrice = await client.prices.retrieve(newPriceId)
  const newPricePence = Number(newPrice.unit_amount || 0)
  const newPriceLabel = moneyFromStripe(newPricePence, newPrice.currency)
  const orderLimit = ORDER_LIMITS[newPlanId] || 500
  const effectiveLabel = londonStamp(effectiveAt)
  const oldName = planNameOf(oldPlanId)
  const newName = planNameOf(newPlanId)

  if (immediate) {
    const licenceState = updated.status === 'trialing' ? 'trialing' : 'active'
    await query(
      `UPDATE users SET
         plan = $2,
         licence_state = $3,
         billing_interval = $4,
         stripe_subscription_id = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, newPlanId, licenceState, newInterval, updated.id],
    )
  }

  await audit(user.id, immediate ? 'plan_changed' : 'plan_change_scheduled', {
    planId: newPlanId,
    subscriptionId: updated.id,
    ip,
    reference,
    detail: JSON.stringify({
      oldPlanId,
      oldInterval,
      newPlanId,
      newInterval,
      immediate,
      effectiveAt: effectiveAt.toISOString(),
      newPricePence,
      prorationPence,
      orderLimit,
    }),
  })

  const timingLine = immediate
    ? isTrial
      ? 'Effective immediately. Your trial end date is unchanged — no charge today.'
      : 'Effective immediately. Any prorated difference is shown below.'
    : `Scheduled for ${effectiveLabel}. You keep ${oldName} until then.`

  const subject = immediate
    ? `Your Margins365 plan is now ${newName}`
    : `Your Margins365 plan change is scheduled`
  const text = [
    `Plan change confirmation`,
    ``,
    `From: ${oldName} (${oldInterval === 'year' ? 'annual' : 'monthly'})`,
    `To: ${newName} (${newInterval === 'year' ? 'annual' : 'monthly'})`,
    `Effective: ${effectiveLabel}`,
    `New price: ${newPricePence} pence including VAT (${newPriceLabel} / ${newInterval === 'year' ? 'year' : 'month'})`,
    `Proration: ${prorationLabel}${prorationPence ? ` (${prorationPence} pence)` : ''}`,
    `New order limit: ${orderLimit.toLocaleString('en-GB')} unique orders / month`,
    timingLine,
    `Reference: ${reference}`,
    `Manage billing: ${ORIGIN_URL}/account/billing`,
    ``,
    '— Margins365',
  ].join('\n')
  const html = `<p><strong>Plan change confirmation</strong></p><ul><li>From: ${oldName} (${oldInterval === 'year' ? 'annual' : 'monthly'})</li><li>To: ${newName} (${newInterval === 'year' ? 'annual' : 'monthly'})</li><li>Effective: ${effectiveLabel}</li><li>New price: <strong>${newPricePence} pence</strong> including VAT (${newPriceLabel} / ${newInterval === 'year' ? 'year' : 'month'})</li><li>Proration: ${prorationLabel}${prorationPence ? ` (${prorationPence} pence)` : ''}</li><li>New order limit: ${orderLimit.toLocaleString('en-GB')} / month</li></ul><p>${timingLine}</p><p>Reference: <strong>${reference}</strong></p><p><a href="${ORIGIN_URL}/account/billing">Plan &amp; billing</a></p><p>— Margins365</p>`

  const mail = await sendMail(user.email, subject, text, html, CONTACT_INBOX)
  if (!mail.ok) {
    await audit(user.id, 'plan_change_email_failed', {
      planId: newPlanId,
      subscriptionId: updated.id,
      detail: mail.message,
      reference,
      ip,
    })
  } else {
    await audit(user.id, 'plan_change_email_sent', {
      planId: newPlanId,
      subscriptionId: updated.id,
      reference,
      ip,
    })
  }

  return {
    status: 200,
    body: {
      ok: true,
      immediate,
      oldPlanId,
      newPlanId,
      oldInterval,
      newInterval,
      effectiveAt: effectiveAt.toISOString(),
      effectiveLabel,
      newPricePence,
      newPriceLabel,
      prorationPence,
      prorationLabel,
      orderLimit,
      reference,
      emailSent: Boolean(mail.ok),
      title: subject,
      message: immediate
        ? `You’re now on ${newName}. ${timingLine}${mail.ok ? ` We’ve emailed ${user.email}.` : ''}`
        : `Your change to ${newName} is scheduled for ${effectiveLabel}. ${mail.ok ? `We’ve emailed ${user.email}.` : ''}`,
    },
  }
}

/** K90 — GET /api/billing/trial-status — poll after Checkout return. */
export async function handleTrialStatus(req) {
  if (!dbConfigured()) {
    return { status: 503, body: { ok: false, message: 'Database is not configured.' } }
  }
  const user = await userFromRequest(req)
  if (!user) return { status: 401, body: { ok: false, message: 'Sign in first.' } }
  const client = stripe()
  if (!client) return { status: 503, body: { ok: false, confirmed: false } }

  await ensureBillingSchema()
  const sub = await findSubscriptionForUser(client, user)
  if (!sub || sub.status !== 'trialing') {
    const { rows } = await query(
      `SELECT trial_start_email_sent_at, plan, trial_ends_at FROM users WHERE id = $1`,
      [user.id],
    )
    return {
      status: 200,
      body: {
        ok: true,
        confirmed: Boolean(rows[0]?.trial_start_email_sent_at),
        waiting: !rows[0]?.trial_start_email_sent_at,
      },
    }
  }

  // Ensure email sent (idempotent)
  const sent = await maybeSendTrialStartEmail({
    userId: user.id,
    email: user.email,
    subscription: sub,
  })

  const planId =
    normalizePlanId(sub.metadata?.margins365_plan || sub.metadata?.marginos_plan || user.plan) ||
    'pro'
  const planName = planId.charAt(0).toUpperCase() + planId.slice(1)
  const price = sub.items?.data?.[0]?.price
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null
  const founding = sub.metadata?.margins365_founding === '1'
  const orderLimits = { starter: 500, growth: 2000, pro: 5000, scale: 15000 }

  return {
    status: 200,
    body: {
      ok: true,
      confirmed: true,
      emailSent: Boolean(sent.sent || user.trial_start_email_sent_at),
      planId,
      planName,
      amountLabel: moneyFromStripe(price?.unit_amount, price?.currency),
      founding,
      trialEndsAt: trialEnd ? trialEnd.toISOString() : null,
      trialEndsLabel: trialEnd ? londonStamp(trialEnd) : null,
      chargeDateLabel: trialEnd ? londonStamp(trialEnd) : null,
      orderLimit: orderLimits[planId] || 500,
      email: user.email,
      title: `Your 14-day free trial of ${planName} has started`,
      body: `Your trial ends on ${trialEnd ? londonStamp(trialEnd) : '—'}. Unless you cancel, we'll charge ${moneyFromStripe(price?.unit_amount, price?.currency)} including VAT on ${trialEnd ? londonStamp(trialEnd) : 'day 15'}${founding ? ' (founding rate first, then the full price)' : ''}. Your plan includes ${(orderLimits[planId] || 500).toLocaleString('en-GB')} orders a month. Cancel any time before then in Plan & billing. We've emailed a confirmation to ${user.email}.`,
    },
  }
}
