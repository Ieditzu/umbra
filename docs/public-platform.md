# Umbra public platform

Go owns the public API, accounts, jobs and billing. PostgreSQL holds customer metadata and an auditable credit ledger. A private Python/OpenCV worker runs the existing analysis engine. The React/TypeScript frontend uses React Router, TanStack Query, Radix Dialog, Lucide and locally bundled fonts.

## Start with Docker

```bash
cp .env.public.example .env.public
```

Replace `POSTGRES_PASSWORD` with a random URL-safe password and `UMBRA_WORKER_TOKEN` with at least 32 random characters. Leave Stripe blank.

```bash
docker compose --env-file .env.public up --build -d
docker compose --env-file .env.public logs -f api
```

Open `http://localhost:8000`. Create an account. Without SMTP, development verification and recovery links appear in API logs. Open the verification link and click **Verify email** to receive 10 starter credits. Production requires email delivery and never prints those links.

Compose starts PostgreSQL, applies migrations, starts the private worker and serves the built frontend from Go. Only Go is exposed on the host. Database and footage use separate named volumes; deleting these volumes deletes stored data.

The original research app remains at `/research.html`, using `uv run umbra-api` separately. Its research endpoints are not exposed by Go. Run the Vite dev server against the local Python API to use camera capture, synthetic demos and labelling.

## Native development

Use Go 1.26+, Node 22.12+, Python 3.12 and PostgreSQL 17.

```bash
uv sync --extra dev
npm --prefix frontend ci
npm --prefix frontend run build
```

Set `DATABASE_URL`, `UMBRA_WORKER_TOKEN`, and an absolute `UMBRA_DATA_DIR` shared by both processes. Keep public storage separate from legacy research data. `UMBRA_PUBLIC_URL` must exactly match the browser origin, including its port.

```bash
# Terminal 1, repository root
uv run uvicorn umbra.worker:app --host 127.0.0.1 --port 8001

# Terminal 2
cd backend
go run ./cmd/umbra migrate
go run ./cmd/umbra serve
```

Go defaults to port 8000, worker port 8001 and frontend directory `../frontend/dist`. For frontend development, run `npm --prefix frontend run dev`, set `UMBRA_PUBLIC_URL=http://localhost:5173`, and use the same hostname consistently. Vite proxies `/api` to Go.

## API and credits

Create and verify an account, then create a key in **API keys**. Its secret appears once; only a hash is stored. See `/docs` and `/api/v1/openapi.json` for examples and the OpenAPI 3.1 contract.

1. Upload multipart `role` and `file` to `POST /api/v1/media`. Roles: `calibration`, `main`, optional `ground_truth`.
2. Submit name and clip IDs to `POST /api/v1/analyses`. Set an `Idempotency-Key` for each logical submission.
3. Poll `/analyses/{id}` or `/jobs/{id}` every few seconds.
4. Download `/analyses/{id}/artifacts/bundle` or `result`, `report`, `predictions`, `overlay`, `visualization`, `hidden_path_visualization` individually.

External clients use `Authorization: Bearer $UMBRA_API_KEY`. Browser mutations use an HTTP-only session plus `X-CSRF-Token` from `/me`. Ownership is checked on every customer object and download.

Submission reserves one credit atomically. Completion debits one and releases the reservation in a transaction. Failure releases it without a debit. Valid no-coverage/no-signal results consume a credit. Replays cannot charge twice; different input under a used key returns 409. Insufficient credits return 402.

Defaults: 250 MB/clip; calibration ≤18 seconds; trial/reference ≤60 seconds; resolution ≤3840 × 2160; 20 active stored clips; 20 uploads/hour; 120 authenticated requests/minute; two outstanding jobs/account; one analysis worker; ten-minute job timeout. Native processing runs in killable child processes. Expired leases retry interrupted jobs once and per-attempt directories fence stale output.

Footage and generated files expire after 30 days; a reused clip's earlier expiry also limits its analysis artifacts. Hourly cleanup removes expired files and result timelines while retaining summaries and ledger entries. Customers may delete terminal analyses/generated files and separately delete their source clips. Running inputs cannot be removed.

## Enable Stripe

Purchases remain unavailable until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID` are all supplied. Partial configuration performs no Stripe requests. The price must be an active, one-time EUR 10.00 price for 100 credits; startup validates it. Use test credentials first.

Set the webhook endpoint to `https://YOUR_HOST/api/v1/billing/webhook`, using Stripe API version `2026-08-26.dahlia` (the pinned Go SDK version), listening for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Fulfillment verifies the raw-body signature, paid state, local order, session, amount and currency, then grants credits transactionally once. Unpaid events and redirect pages do not grant credits.

No live credentials, subscription or refund UI are included. Reconcile refunds/disputes through the audited operator command. Negative adjustments may create a negative balance, blocking further submissions.

```bash
docker compose --env-file .env.public exec api /app/umbra credits \
  --email researcher@example.com --amount 20 \
  --reference support-case-123 --reason "Approved research allowance"
```

Adjustment references are unique, making repeated commands idempotent. The command does not bypass verification.

## Production and backups

Set `UMBRA_ENV=production`, an HTTPS `UMBRA_PUBLIC_URL`, and `SMTP_HOST` (`host:port`), `SMTP_FROM`, plus SMTP credentials when required. SMTP must support STARTTLS. Put a TLS reverse proxy before the loopback-bound Go service, allowing a 251 MB body and two-minute upload timeout. Preserve the original `Origin` header. Production cookies are Secure. Never expose the legacy Python API, worker, database or footage volume.

For per-client abuse limits behind a proxy, set `UMBRA_TRUSTED_PROXY_CIDRS` to the proxy's exact network addresses, comma-separated. Only those peers may supply `X-Forwarded-For`; untrusted headers are ignored. Have the proxy overwrite or append that header correctly. Without this setting, unauthenticated limits use the direct peer address. Authenticated limits always apply per account.

`/api/v1/health` checks the public process; `/api/v1/ready` checks database and worker connectivity. Inspect structured Go logs for worker/settlement errors and job IDs. Protect development logs because they contain one-time email links; do not run development mode publicly.

Back up PostgreSQL with `pg_dump` and the footage volume together. Restore into an isolated stack, run migrations, and verify artifacts before switching traffic. Migrations are additive and protected by a PostgreSQL advisory lock. Never import legacy SQLite data automatically. Run one public dispatcher instance for this release.

## Validation

```bash
uv run --extra dev pytest -q
uv run --extra dev ruff check src tests
npm --prefix frontend run build
npm --prefix frontend run lint
cd backend
go test ./...
go vet ./...
UMBRA_TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/TEST_DB go test -race ./...
```

PostgreSQL tests create and delete only their own temporary schemas. They cover account verification, CSRF, password reset, key revocation, isolation, upload limits, concurrent reservations, idempotency, lease recovery, stale settlement, expiry, disabled Stripe and payment replay. Python tests exercise private worker boundaries and the actual synthetic analysis pipeline. Validate signup → upload → analysis → evidence download in a browser with synthetic or consented footage before deployment.
