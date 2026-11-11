/**
 * Postgres pool + schema migrate for Margins365 auth / licences.
 */
import pg from 'pg'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

function connectionConfig() {
  const raw = process.env.DATABASE_URL
  if (!raw) return null
  // Parse URI so we can force TLS settings DigitalOcean managed PG accepts from Node.
  const u = new URL(raw)
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'defaultdb',
    ssl: { rejectUnauthorized: false },
    max: 5,
  }
}

export function getPool() {
  if (!dbConfigured()) return null
  if (!pool) {
    pool = new Pool(connectionConfig())
  }
  return pool
}

export async function migrate() {
  const p = getPool()
  if (!p) return false
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      plan TEXT NOT NULL DEFAULT 'free',
      licence_state TEXT NOT NULL DEFAULT 'none',
      time_zone TEXT,
      stripe_customer_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sign_in_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS verification_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS verification_tokens_user_id_idx ON verification_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  // Soft-launch columns (idempotent)
  await p.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled_platforms TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_interval TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_consumed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_email_sent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_failed_email_sent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_reference TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document TEXT NOT NULL,
      version TEXT NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip TEXT,
      source TEXT
    );
    CREATE INDEX IF NOT EXISTS legal_acceptances_user_id_idx ON legal_acceptances(user_id);
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS feature_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT,
      email TEXT,
      request_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS feature_suggestions_user_id_idx ON feature_suggestions(user_id);
  `)
  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uidx
      ON users (google_sub)
      WHERE google_sub IS NOT NULL;
  `)
  // K72 founding counter
  await p.query(`
    CREATE TABLE IF NOT EXISTS founding_places (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'released')),
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      plan_id TEXT,
      interval TEXT
    );
    CREATE INDEX IF NOT EXISTS founding_places_status_idx ON founding_places(status);
  `)
  // K68 shops + seat invites (server SoT)
  await p.query(`
    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS shops_user_id_idx ON shops(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS shops_user_name_uidx
      ON shops (user_id, lower(name));

    CREATE TABLE IF NOT EXISTS seat_invites (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS seat_invites_owner_idx ON seat_invites(owner_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS seat_invites_owner_email_pending_uidx
      ON seat_invites (owner_user_id, lower(email))
      WHERE status = 'pending';
  `)
  return true
}

export async function query(text, params) {
  const p = getPool()
  if (!p) throw new Error('DATABASE_URL is not configured')
  return p.query(text, params)
}
