# EchoGPT Backend

Production-oriented NestJS REST API for the EchoGPT Chrome Extension.

## Stack

- NestJS + TypeScript (strict)
- PostgreSQL + Prisma
- JWT authentication + refresh-token sessions
- RBAC (USER / ADMIN)
- Swagger / OpenAPI
- Security headers (Helmet-compatible)
- Docker
- Jest + ESLint + Prettier

## Getting started

```bash
cp .env.example .env
# Fill DATABASE_URL, JWT_ACCESS_SECRET, ENCRYPTION_KEY
# Optional: SMTP_*, REDIS_HOST, WEB_SEARCH_API_KEY
npm install
npx prisma generate
docker compose up -d postgres redis
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

- API base: `http://localhost:3000/api/v1`
- Health: `GET /api/v1/health`
- **API Documentation (Swagger):** `http://localhost:3000/api/docs`

Interactive OpenAPI docs with request/response schemas, JWT **Authorize**, and try-it-out against the running API.

### Seeded demo admin

After seeding:

- Email: `admin@echogpt.local`
- Password: `AdminPassword123!`

Change this password in any shared/non-local environment.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run lint` | ESLint + Prettier fix |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed roles, plans, providers, demo admin |

## Environment

Copy `.env.example` to `.env` and fill required values. Never commit `.env`.

**Required**

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `ENCRYPTION_KEY`

**Optional (defaults in `.env.example`)**

- App: `NODE_ENV`, `PORT`, `API_PREFIX`, `API_VERSION`, `CORS_ORIGIN`, `SWAGGER_*`
- Auth: `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `EMAIL_VERIFICATION_EXPIRES_HOURS`, `REQUIRE_EMAIL_VERIFICATION`
- SMTP: `SMTP_*`, `EMAIL_VERIFICATION_URL` (all-or-nothing when enabling email)
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_KEY_PREFIX`, timeouts
- Rate limit: `THROTTLE_TTL_MS`, `THROTTLE_LIMIT`
- AI / search: `AI_*`, `WEB_SEARCH_*`, `WEB_SEARCH_CACHE_TTL_SECONDS`

**Test-only**

- `EMAIL_MOCK` — e2e sets `true` via `test/setup-e2e.ts`
- `AI_COMPLETION_MOCK` / `WEB_SEARCH_MOCK` — used by chat/search e2e when live providers are not available

### Redis (optional)

Redis is **optional**. If `REDIS_HOST` is empty or Redis is unavailable, the application continues without caching. Core auth, chat, search, subscriptions, and admin stay available.

`GET /api/v1/health` reports Redis/SMTP as informational fields. Only database downtime returns HTTP 503.

```bash
docker compose up -d redis
# .env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### HTTP rate limiting

Global throttling via `@nestjs/throttler` (`THROTTLE_TTL_MS` / `THROTTLE_LIMIT`). Uses Redis when available and falls back to in-memory storage if Redis is down (fail-open for infrastructure availability).

### Email verification enforcement

`REQUIRE_EMAIL_VERIFICATION=false` (default) keeps existing login behavior. When `true`, unverified users cannot obtain sessions at login.

## Project structure

```
src/
  auth/ users/ roles/ sessions/ subscriptions/
  providers/ chat/ search/ usage/ admin/
  health/ prisma/ common/
```

## API overview

### Auth (`/api/v1/auth`)
- Register, login, refresh, logout, me
- Email verification + resend (hashed tokens; SMTP delivery via Nodemailer)

### Email verification (SMTP)

Configure SMTP in `.env` (see `.env.example`):

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=EchoGPT
EMAIL_VERIFICATION_URL=http://localhost:3000/api/v1/auth/verify-email
EMAIL_MOCK=false
```

Notes:

- SMTP is optional at startup. Incomplete or unavailable SMTP does not crash the app.
- When enabling SMTP, set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `EMAIL_VERIFICATION_URL` together.
- Registration still succeeds if email delivery fails; use `POST /auth/resend-verification` once SMTP is available.
- E2E tests force `EMAIL_MOCK=true` so they never send real mail.
- Gmail requires an App Password (2-Step Verification), not your normal account password.
- Verification link format: `EMAIL_VERIFICATION_URL?token=<raw-token>`
- Endpoints: `GET|POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification`
- Raw tokens are never stored, logged, or returned from APIs.

### Users (`/api/v1/users`)
- Self: profile get/update, change password, soft-delete account
- Admin: list users, get user by id

### Subscriptions (`/api/v1/subscriptions`)
- Plans, current subscription/status, upgrade, downgrade
- Usage counted dynamically from successful `APIUsageLog` entries (no duplicated counters)
- `requestLimit = null` → unlimited; exceeded limit → HTTP 429

### AI Providers
- User: list active providers, configure personal keys, set default
- Admin (`/api/v1/admin/ai-providers`): CRUD, enable/disable, default, health-check

### Chat (`/api/v1/conversations`)
- Conversation CRUD (soft-delete), message history, send prompt + AI response
- Streaming: `POST /conversations/:id/messages/stream` (SSE `chunk` / `done` / `error`)
- Ownership enforced; usage logged on successful completion only; provider credentials stay server-side

### Web Search (`/api/v1/web-search`)
- Search, history, recent, suggestions, get/delete own records
- Optional Redis cache for provider results (TTL); per-user history always stored in PostgreSQL
- Mock mode via `WEB_SEARCH_MOCK=true`

### Admin (`/api/v1/admin`) — ADMIN role required
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/dashboard` | Nested dashboard statistics |
| GET | `/admin/users` | List/search/filter users |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id/status` | Activate / deactivate user |
| PATCH | `/admin/users/:id/role` | Change USER/ADMIN role |
| GET | `/admin/users/:id/subscription` | User active subscription |
| GET | `/admin/users/:id/usage` | User usage summary |
| GET | `/admin/usage` | Usage analytics |
| GET | `/admin/logs` | Paginated request logs |
| GET | `/admin/system/health` | System + provider health |
| * | `/admin/subscription-plans` | Plan CRUD |
| * | `/admin/subscriptions` | List/filter/get/update status |
| * | `/admin/ai-providers` | Provider management |

Public probes remain on `GET /api/v1/health`.

## Architecture notes

- Controllers → Services → Prisma → PostgreSQL
- JWT access tokens + hashed refresh tokens in `Session`
- AI provider API keys encrypted with `ENCRYPTION_KEY`
- Usage metering: successful `APIUsageLog` aggregation over billing period (failures logged, not billed)
- Ownership checks on conversations, messages, and search history

## Known limitations / bonus (not core)

- Search result caching uses optional Redis (fail-open); without Redis, search still works
- AI streaming is available via SSE (`POST .../messages/stream`)
- No payment gateway integration (by design)

## Subscription & Usage Architecture

### Subscription Lifecycle
- **Plans**: Stored in PostgreSQL (`SubscriptionPlan`). Default tiers: `FREE` and `PREMIUM`.
- **Auto-Provisioning**: Registration creates an active `FREE` subscription in a transaction.
- **Status Lifecycle**: `ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `EXPIRED`.

### Usage Calculation & Billing Boundaries
- **Dynamic Metering**: Successful requests (HTTP 2xx/3xx) are counted from `APIUsageLog` with a DB-level `COUNT`.
- **Failed provider calls**: Still recorded in `APIUsageLog` for analytics/admin logs, but **do not consume** subscription quota.
- **No Duplicated State**: No stored `remainingRequests` / `currentUsage` columns.
- **Billing Period**: Half-open interval `[currentPeriodStart, currentPeriodEnd)`.
- **Quota Exceeded**: HTTP 429 with subscription limit semantics.
- **Guard**: `SubscriptionUsageGuard` on chat send and web search.
