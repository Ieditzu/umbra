CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 verified boolean NOT NULL DEFAULT false, starter_granted boolean NOT NULL DEFAULT false,
 credits integer NOT NULL DEFAULT 0, reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS account_tokens (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, prefix text NOT NULL, token_hash text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS media (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('calibration','main','ground_truth')),
 name text NOT NULL, relative_path text NOT NULL, metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS analyses (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, request jsonb NOT NULL, request_hash text NOT NULL,
 idempotency_key text, status text NOT NULL DEFAULT 'queued', progress double precision NOT NULL DEFAULT 0,
 message text NOT NULL DEFAULT 'Waiting for a worker', result jsonb, artifacts jsonb,
 attempt text, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, deleted_at timestamptz,
 UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS analysis_queue ON analyses(status, created_at);
CREATE INDEX IF NOT EXISTS analysis_owner ON analyses(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS credit_ledger (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 amount integer NOT NULL, kind text NOT NULL, reference text NOT NULL UNIQUE,
 description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS checkout_orders (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), session_id text UNIQUE,
 credits integer NOT NULL, amount integer NOT NULL, currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stripe_events (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
