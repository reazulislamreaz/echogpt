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
# Fill DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY
npm install
npx prisma generate
docker compose up -d postgres
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

- API base: `http://localhost:3000/api/v1`
- Health: `GET /api/v1/health`
- Swagger: `http://localhost:3000/api/docs`

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

See `.env.example` for placeholders. Important variables:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY` (AES-256-GCM for AI provider keys)
- `AI_COMPLETION_MOCK` / `AI_REQUEST_TIMEOUT_MS`
- `WEB_SEARCH_MOCK` / `WEB_SEARCH_PROVIDER` / `WEB_SEARCH_API_KEY`

Never commit a real `.env` file.

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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_FROM_NAME=EchoGPT
EMAIL_VERIFICATION_URL=http://localhost:3000/api/v1/auth/verify-email
```

Notes:

- SMTP is optional at startup in every environment. Incomplete or unavailable SMTP does not crash the app.
- Registration still succeeds if email delivery fails; use `POST /auth/resend-verification` once SMTP is available.
- Automated e2e tests set `EMAIL_MOCK=true` so they never send real mail.
- Gmail requires an **App Password** (2-Step Verification), not your normal account password.
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
- Ownership enforced; usage logged; provider credentials stay server-side

### Web Search (`/api/v1/web-search`)
- Search, history, recent, suggestions, get/delete own records
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

- Streaming AI responses: **not implemented** (optional bonus)
- Search result caching / Redis: **not implemented** (optional bonus)
- Email delivery requires SMTP env configuration (Nodemailer); without SMTP in development, registration still succeeds and verification can be resent once SMTP is set
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
