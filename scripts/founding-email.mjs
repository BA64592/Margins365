/**
 * GA-22 — founding price ends soon (14 days before full price).
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { dbConfigured, query } from './db.mjs'
import { ensureFoundingSchema } from './founding.mjs'
import { SUPPORT_INBOX, sesFromAddress } from './support-inbox.mjs'

const APP_ORIGIN = (
  process.env.APP_ORIGIN ||
  process.env.VITE_PRODUCT_DOMAIN ||
  'https://margins365.com'
).replace(/\/$/, '')
const ORIGIN_URL = APP_ORIGIN.startsWith('http') ? APP_ORIGIN : `https://${APP_ORIGIN}`
const CONTACT_INBOX = SUPPORT_INBOX
const FOUNDING_MONTHS = 6

const FULL_PRICES = {
  starter: { month: 3900, year: 39000 },
  growth: { month: 7900, year: 79000 },
  pro: { month: 12900, year: 129000 },
  scale: { month: 19900, year: 199000 },
}

function sesCfg() {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = sesFromAddress()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!from || !accessKeyId || !secretAccessKey) return null
  return { region, from, accessKeyId, secretAccessKey }
}

async function sendMail(to, subject, text, html) {
  const cfg = sesCfg()
  if (!cfg) return { ok: false, message: 'SES is not configured.' }
  const client = new SESv2Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: cfg.from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [CONTACT_INBOX],
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      },
    }),
  )
  return { ok: true }
}

function londonStamp(d) {
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/London',
    }).format(d) + ' Europe/London'
  )
}

function moneyPence(pence) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(pence) / 100)
}

function fullPriceDate(confirmedAt, interval) {
  const start = new Date(confirmedAt)
  if (String(interval) === 'year') {
    const d = new Date(start)
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  const d = new Date(start)
  d.setUTCMonth(d.getUTCMonth() + FOUNDING_MONTHS)
  return d
}

export async function runFoundingEndsSoonJob() {
  if (!dbConfigured()) return { ok: false, sent: 0 }
  await ensureFoundingSchema()
  await query(`
    ALTER TABLE founding_places ADD COLUMN IF NOT EXISTS founding_ends_soon_sent_at TIMESTAMPTZ;
  `)

  const { rows } = await query(
    `SELECT fp.user_id, fp.plan_id, fp.interval, fp.confirmed_at, u.email
     FROM founding_places fp
     JOIN users u ON u.id = fp.user_id
     WHERE fp.status = 'confirmed'
       AND fp.confirmed_at IS NOT NULL
       AND fp.founding_ends_soon_sent_at IS NULL
       AND COALESCE(u.account_closed_at, NULL) IS NULL
     LIMIT 100`,
  )

  const now = Date.now()
  let sent = 0
  for (const row of rows) {
    const fullAt = fullPriceDate(row.confirmed_at, row.interval)
    const remindAt = fullAt.getTime() - 14 * 24 * 60 * 60 * 1000
    if (now < remindAt) continue
    if (now > fullAt.getTime() + 2 * 24 * 60 * 60 * 1000) {
      // too late — mark so we don't spam forever
      await query(
        `UPDATE founding_places SET founding_ends_soon_sent_at = NOW() WHERE user_id = $1`,
        [row.user_id],
      )
      continue
    }
    const planId = String(row.plan_id || 'pro').toLowerCase()
    const iv = String(row.interval || 'month') === 'year' ? 'year' : 'month'
    const pence = FULL_PRICES[planId]?.[iv] || FULL_PRICES.pro[iv]
    const foundingPence = Math.round(pence * (iv === 'year' ? 0.75 : 0.5))
    const planName = planId.charAt(0).toUpperCase() + planId.slice(1)
    const subject = `Your Margins365 founding price ends soon`
    const text = [
      `Your founding price for ${planName} ends on ${londonStamp(fullAt)}.`,
      `Until then you pay ${moneyPence(foundingPence)} including VAT.`,
      `After that, the full price is ${moneyPence(pence)} including VAT per ${iv === 'year' ? 'year' : 'month'}.`,
      `Manage billing: ${ORIGIN_URL}/account/billing`,
      '',
      '— Margins365',
    ].join('\n')
    const html = `<p>Your founding price for <strong>${planName}</strong> ends on <strong>${londonStamp(fullAt)}</strong>.</p><p>Until then you pay <strong>${moneyPence(foundingPence)}</strong> including VAT.</p><p>After that, the full price is <strong>${moneyPence(pence)}</strong> including VAT per ${iv === 'year' ? 'year' : 'month'}.</p><p><a href="${ORIGIN_URL}/account/billing">Plan &amp; billing</a></p><p>— Margins365</p>`
    if (!row.email) continue
    const mail = await sendMail(row.email, subject, text, html)
    if (mail.ok) {
      await query(
        `UPDATE founding_places SET founding_ends_soon_sent_at = NOW() WHERE user_id = $1`,
        [row.user_id],
      )
      sent += 1
    }
  }
  return { ok: true, sent, scanned: rows.length }
}
