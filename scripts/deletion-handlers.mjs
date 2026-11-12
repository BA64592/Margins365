/**
 * GA-14 / GA-42 / GA-43 / GA-44 — schedule wipe, run deletions, close accounts.
 */
import { randomBytes } from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { dbConfigured, query } from './db.mjs'

const APP_ORIGIN = (
  process.env.APP_ORIGIN ||
  process.env.VITE_PRODUCT_DOMAIN ||
  'https://margins365.com'
).replace(/\/$/, '')
const ORIGIN_URL = APP_ORIGIN.startsWith('http') ? APP_ORIGIN : `https://${APP_ORIGIN}`
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'info.marginos@gmail.com'

function sesCfg() {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-north-1'
  const from = process.env.SES_FROM_ADDRESS || process.env.SES_FROM_EMAIL
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

function londonStamp(d = new Date()) {
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/London',
    }).format(d) + ' Europe/London'
  )
}

export async function ensureDeletionSchema() {
  if (!dbConfigured()) return
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_due_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_closed_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_tombstone_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS data_deleted_email_sent_at TIMESTAMPTZ;
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS deletion_tombstones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT,
      reason TEXT,
      wiped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      backups_clear_by TIMESTAMPTZ NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS deletion_tombstones_user_id_idx ON deletion_tombstones(user_id);
  `)
}

/**
 * Schedule access end + wipe. Never sets plan to "free".
 * @param {{ userId: string, licenceState?: string, accessEndsAt: Date, reason: string, immediate?: boolean, email?: string }} args
 */
export async function scheduleAccountDeletion(args) {
  if (!dbConfigured() || !args.userId) return { ok: false }
  await ensureDeletionSchema()
  const accessEndsAt = args.accessEndsAt instanceof Date ? args.accessEndsAt : new Date(args.accessEndsAt)
  const licenceState = args.licenceState || (args.immediate ? 'removed_full_refund' : 'canceled_access')
  await query(
    `UPDATE users SET
       licence_state = $2,
       cancel_at = $3,
       deletion_due_at = $3,
       deletion_reason = $4,
       updated_at = NOW()
     WHERE id = $1`,
    [args.userId, licenceState, accessEndsAt.toISOString(), args.reason || 'scheduled'],
  )
  // Kill sessions when access already ended
  if (args.immediate || accessEndsAt.getTime() <= Date.now()) {
    await query(`DELETE FROM sessions WHERE user_id = $1`, [args.userId])
  }
  return { ok: true, accessEndsAt: accessEndsAt.toISOString(), licenceState }
}

/** Clear a pending wipe after Keep my plan / resubscribe. */
export async function clearScheduledDeletion(userId) {
  if (!dbConfigured() || !userId) return { ok: false }
  await ensureDeletionSchema()
  await query(
    `UPDATE users SET
       deletion_due_at = NULL,
       deletion_reason = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND account_closed_at IS NULL`,
    [userId],
  )
  return { ok: true }
}

export async function wipeUserProductData(userId) {
  if (!dbConfigured() || !userId) return
  await query(`DELETE FROM shop_workspaces WHERE user_id = $1`, [userId]).catch(() => {})
  await query(`DELETE FROM account_order_usage WHERE user_id = $1`, [userId]).catch(() => {})
  await query(`DELETE FROM shops WHERE user_id = $1`, [userId]).catch(() => {})
  await query(`DELETE FROM seat_invites WHERE owner_user_id = $1`, [userId]).catch(() => {})
}

async function sendDataDeletedEmail(email, tombstoneId, wipedAt) {
  if (!email) return { ok: false }
  const clearBy = new Date(wipedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
  const subject = 'Your Margins365 data has been deleted'
  const text = [
    `Your Margins365 account data has been permanently deleted.`,
    `Deleted: ${londonStamp(wipedAt)}`,
    `Backups are cleared within 7 days (by ${londonStamp(clearBy)}).`,
    `Reference: ${tombstoneId}`,
    `You can create a new empty account any time at ${ORIGIN_URL}`,
    '',
    '— Margins365',
  ].join('\n')
  const html = `<p>Your Margins365 account data has been permanently deleted.</p><p>Deleted: ${londonStamp(wipedAt)}</p><p>Backups are cleared within 7 days (by ${londonStamp(clearBy)}).</p><p>Reference: <strong>${tombstoneId}</strong></p><p><a href="${ORIGIN_URL}">Create a new empty account</a></p><p>— Margins365</p>`
  return sendMail(email, subject, text, html)
}

async function sendAccessEndedNotice(email, accessEndsAt, reason) {
  if (!email) return { ok: false }
  const subject = 'Your Margins365 access is ending'
  const text = [
    `Your Margins365 access ends on ${londonStamp(accessEndsAt)}.`,
    `Reason: ${reason}.`,
    `Download your data before then: ${ORIGIN_URL}/account/billing`,
    `On that date your account closes and your data is permanently deleted. Backups are cleared within 7 days.`,
    '',
    '— Margins365',
  ].join('\n')
  const html = `<p>Your Margins365 access ends on <strong>${londonStamp(accessEndsAt)}</strong>.</p><p>Reason: ${reason}.</p><p><a href="${ORIGIN_URL}/account/billing">Download your data before then</a>.</p><p>On that date your account closes and your data is permanently deleted. Backups are cleared within 7 days.</p><p>— Margins365</p>`
  return sendMail(email, subject, text, html)
}

export { sendAccessEndedNotice }

/**
 * Idempotent deletion job — wipe due accounts, tombstone, email, close login.
 */
export async function runDueDeletions() {
  if (!dbConfigured()) return { ok: false, wiped: 0 }
  await ensureDeletionSchema()
  const { rows } = await query(
    `SELECT id, email, plan, deletion_reason, deletion_tombstone_id, data_deleted_email_sent_at
     FROM users
     WHERE deletion_due_at IS NOT NULL
       AND deletion_due_at <= NOW()
       AND account_closed_at IS NULL
     ORDER BY deletion_due_at ASC
     LIMIT 50`,
  )
  let wiped = 0
  for (const user of rows) {
    const tombstoneId = user.deletion_tombstone_id || `DEL-${randomBytes(6).toString('hex').toUpperCase()}`
    const wipedAt = new Date()
    const backupsClearBy = new Date(wipedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    await wipeUserProductData(user.id)
    await query(`DELETE FROM sessions WHERE user_id = $1`, [user.id])
    await query(
      `INSERT INTO deletion_tombstones (id, user_id, email, reason, wiped_at, backups_clear_by, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        tombstoneId,
        user.id,
        user.email || null,
        user.deletion_reason || 'access_ended',
        wipedAt.toISOString(),
        backupsClearBy.toISOString(),
        JSON.stringify({ plan: user.plan }),
      ],
    )
    await query(
      `UPDATE users SET
         account_closed_at = $2,
         deletion_tombstone_id = $3,
         licence_state = 'ended',
         cancel_at_period_end = FALSE,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, wipedAt.toISOString(), tombstoneId],
    )
    if (!user.data_deleted_email_sent_at && user.email) {
      const mail = await sendDataDeletedEmail(user.email, tombstoneId, wipedAt)
      if (mail.ok) {
        await query(
          `UPDATE users SET data_deleted_email_sent_at = NOW() WHERE id = $1`,
          [user.id],
        )
      }
    }
    wiped += 1
  }
  return { ok: true, wiped, scanned: rows.length }
}
