# EchoGPT Backend API

REST API backend for the **EchoGPT Chrome Extension**. It provides authentication, user and subscription management, encrypted AI provider configuration, conversations with AI chat (including Server-Sent Events streaming), web search with personal history, usage metering, HTTP rate limiting, and administrator analytics.

The API is versioned under `/api/v1` and ships with interactive Swagger/OpenAPI documentation.

## Features

- User registration and login with **bcrypt** password hashing
- **JWT** access tokens and opaque **refresh tokens** (hashed in `Session`, with rotation)
- Secure logout and session revocation
- Email verification via **Nodemailer** (SMTP optional; fail-open if unavailable)
- User profile management, password change, and soft-delete
- Role-based access control (**USER** / **ADMIN**)
- Subscription plans (Free / Premium), upgrade / downgrade, and billing periods
- Dynamic usage limits from successful `APIUsageLog` aggregation
- AI provider management (system + per-user config) with **AES-256-GCM** encrypted API keys
- Supported completion adapters: **OpenAI**, **Anthropic Claude**, **Google Gemini**
- Conversations, messages, and AI chat
- AI response **SSE streaming** (`chunk` / `done` / `error`)
- Web search, search history, recent searches, and suggestions
- Optional **Redis** caching for search results (fail-open)
- Global HTTP **rate limiting** (`@nestjs/throttler`)
- Admin dashboard, user/subscription/provider management, usage analytics, and request logs
- Health checks (database critical; Redis/SMTP informational)
- Swagger / OpenAPI at `/api/docs`

## Tech stack

| Technology | Purpose |
| --- | --- |
| NestJS | Application framework and modular HTTP API |
| TypeScript | Typed application code |
| PostgreSQL | Primary relational database |
| Prisma | ORM, schema, migrations, and seeding |
| JWT (`@nestjs/jwt`, passport-jwt) | Access-token authentication |
| bcrypt | Password hashing |
| class-validator / class-transformer | DTO validation and transformation |
| Nodemailer | SMTP email delivery for verification |
| Redis + ioredis | Optional cache and throttle storage |
| `@nestjs/throttler` | Global HTTP rate limiting |
| OpenAI / Anthropic / Gemini HTTP APIs | AI chat completions (via provider adapters) |
| Serper (configurable) | Web search provider integration |
| Swagger (`@nestjs/swagger`) | Interactive OpenAPI documentation |
| Docker Compose | Optional local PostgreSQL / Redis (and optional API image) |
| Jest + Supertest | Unit and end-to-end tests |
| ESLint + Prettier | Linting and formatting |

## Architecture

The project uses a modular NestJS layered design (not Hexagonal/CQRS/DDD):

```text
Client (Chrome extension / HTTP client / Swagger UI)
    ↓
Controller          — route mapping, DTO binding, Swagger metadata
    ↓
Guards / Validation — JWT auth, roles, subscription quota, ValidationPipe
    ↓
Application service — business rules and transactions
    ↓
Prisma / externals  — PostgreSQL, AI providers, search, SMTP, Redis (optional)
    ↓
HTTP response       — typed DTOs or SSE stream
```

| Layer | Responsibility |
| --- | --- |
| Controllers | Thin HTTP adapters; no Prisma access and no business logic |
| Guards | `JwtAuthGuard`, `RolesGuard`, `SubscriptionUsageGuard`, global `ThrottlerGuard` |
| Validation | Global `ValidationPipe` (whitelist, forbid unknown fields, transform) |
| Services | Domain logic, ownership checks, transactions, usage recording |
| Prisma | Database access to PostgreSQL |
| External adapters | AI completion, web search, email, Redis (optional / fail-open) |
| Cross-cutting | `AllExceptionsFilter`, security headers, Swagger bootstrap |

Request flow for protected APIs:

1. Global throttle check
2. JWT authentication (when required)
3. Role check (admin routes)
4. Subscription usage check (chat send / web search)
5. Service execution
6. Consistent JSON error envelope on failure

## Project structure

```text
echogpt/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── main.ts                 # Bootstrap, CORS, versioning, Swagger
│   ├── app.module.ts
│   ├── auth/                   # Register, login, refresh, logout, email verification
│   ├── users/                  # Profile, password, soft-delete; admin list/get
│   ├── roles/                  # USER/ADMIN enum, RolesGuard
│   ├── sessions/               # Session module wiring
│   ├── subscriptions/          # Plans, status, upgrade/downgrade, admin plans
│   ├── providers/              # User + admin AI provider management
│   ├── chat/                   # Conversations, messages, SSE streaming
│   ├── search/                 # Web search + history (+ optional Redis cache)
│   ├── usage/                  # APIUsageLog recording / aggregation helpers
│   ├── admin/                  # Dashboard, users, analytics, logs, system health
│   ├── health/                 # Public health probe
│   ├── prisma/                 # PrismaModule / PrismaService
│   └── common/                 # Config, filters, redis, swagger, encryption, DTOs
├── test/                       # E2E specs + setup
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```

## Prerequisites

- Node.js 22+ (Dockerfile uses `node:22-alpine`)
- npm
- **PostgreSQL** (required) — local install or Docker
- **Redis** (optional) — leave disabled unless you want search caching / Redis-backed throttling
- **Docker** (optional) — convenience for running PostgreSQL and/or Redis; not mandatory

## Database & Infrastructure Setup

EchoGPT uses **PostgreSQL** as its primary database and **Redis** as an optional infrastructure dependency.

### Option A — Use Local PostgreSQL

Install and run PostgreSQL on your machine (without Docker), create a database (for example `echogpt`), then set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/echogpt
```

Generate the Prisma Client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

### Option B — Use Docker

Docker can run PostgreSQL for you. From the project root:

```bash
docker compose up -d postgres
```

Compose defaults (`docker-compose.yml`):

- User: `echogpt`
- Password: `echogpt`
- Database: `echogpt`
- Port: `5432`

Example `DATABASE_URL` for this service:

```env
DATABASE_URL=postgresql://echogpt:echogpt@localhost:5432/echogpt?schema=public
```

Then generate the Prisma Client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

### Redis (Optional)

Redis is **optional**. The application starts and operates without it (fail-open design).

When Redis is available and `REDIS_HOST` is set, it is used for:

- Web-search result caching
- Distributed HTTP rate-limit storage

When Redis is unavailable or `REDIS_HOST` is empty:

- Web-search caching is bypassed
- The rate limiter falls back to in-memory storage
- Core API functionality (auth, users, subscriptions, chat, search, admin) remains available

To run Redis with Docker:

```bash
docker compose up -d redis
```

Then set in `.env` (example):

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

To start PostgreSQL and Redis together (optional convenience only):

```bash
docker compose up -d postgres redis
```

## Getting started

### 1. Clone and install

```bash
git clone <repository-url>
cd echogpt
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Set at least:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `JWT_ACCESS_SECRET` | Strong secret for access tokens (or legacy `JWT_SECRET`) |
| `ENCRYPTION_KEY` | Secret used to derive AES-256-GCM key for provider API keys |

Example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/echogpt
JWT_ACCESS_SECRET=change-me-to-a-long-random-string
ENCRYPTION_KEY=change-me-to-another-long-random-string
```

Leave `REDIS_HOST` empty unless you intentionally enable optional Redis.

### 3. Database setup

Follow [Database & Infrastructure Setup](#database--infrastructure-setup) (local PostgreSQL or Docker). Ensure `npx prisma generate` and `npx prisma migrate deploy` have been run.

### 4. Seed reference data

```bash
npm run prisma:seed
```

### 5. Run the API

```bash
npm run start:dev
```

| Resource | URL |
| --- | --- |
| API base | http://localhost:3000/api/v1 |
| Health | http://localhost:3000/api/v1/health |
| Swagger UI | http://localhost:3000/api/docs |

Interactive OpenAPI docs include request/response schemas and a JWT **Authorize** button for trying authenticated endpoints.

### Seeded demo admin

After seeding:

| Field | Value |
| --- | --- |
| Email | `admin@echogpt.local` |
| Password | `AdminPassword123!` |

Change this password outside local/dev environments. Seed also creates `USER` / `ADMIN` roles, `free` / `premium` plans, and OpenAI / Claude / Gemini provider records (without API keys).

## Environment variables

Copy `.env.example` → `.env`. Never commit `.env`.

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL |
| `JWT_ACCESS_SECRET` | JWT signing secret (`JWT_SECRET` accepted as fallback) |
| `ENCRYPTION_KEY` | Encryption secret for AI provider API keys |

### Application

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3000` | HTTP port |
| `API_PREFIX` | `api` | Global prefix |
| `API_VERSION` | `1` | URI version (`/api/v1`) |
| `CORS_ORIGIN` | `*` | CORS origin(s), comma-separated when not `*` |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI |
| `SWAGGER_PATH` | `docs` | Path under API prefix (`/api/docs`) |

### Auth

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `BCRYPT_SALT_ROUNDS` | `10` | bcrypt cost factor |
| `EMAIL_VERIFICATION_EXPIRES_HOURS` | `24` | Verification token lifetime |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | When `true`, unverified users cannot log in |

### SMTP (optional)

When enabling email, set **all** of: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_VERIFICATION_URL`.

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | — | SMTP host |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | TLS flag |
| `SMTP_USER` / `SMTP_PASS` | — | Credentials |
| `SMTP_FROM` / `SMTP_FROM_NAME` | / `EchoGPT` | From address / display name |
| `EMAIL_VERIFICATION_URL` | — | Base verify URL (token appended as `?token=`) |
| `EMAIL_MOCK` | `false` | Skip real SMTP sends (e2e forces `true`) |

Incomplete SMTP configuration fails environment validation. Unavailable SMTP does not crash the running app; registration still succeeds and verification can be resent later.

### Redis (optional)

Redis is not required. Keep `REDIS_HOST` empty to run without Redis.

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_HOST` | empty | Empty disables Redis |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Optional password |
| `REDIS_DB` | `0` | Database index |
| `REDIS_KEY_PREFIX` | `echogpt:` | Key prefix |
| `REDIS_CONNECT_TIMEOUT_MS` | `2000` | Connect timeout |
| `REDIS_COMMAND_TIMEOUT_MS` | `1000` | Command timeout |

### Rate limiting

| Variable | Default | Description |
| --- | --- | --- |
| `THROTTLE_TTL_MS` | `60000` | Window length in ms |
| `THROTTLE_LIMIT` | `100` | Max requests per window |

Uses Redis for throttle storage when Redis is configured and available; otherwise falls back to in-memory storage (fail-open).

### AI and web search

| Variable | Default | Description |
| --- | --- | --- |
| `AI_COMPLETION_MOCK` | `false` | Mock AI responses (useful for tests) |
| `AI_REQUEST_TIMEOUT_MS` | `30000` | Upstream AI timeout |
| `WEB_SEARCH_MOCK` | `false` | Mock search results |
| `WEB_SEARCH_PROVIDER` | `serper` | Search provider id |
| `WEB_SEARCH_API_KEY` | — | Search provider API key |
| `WEB_SEARCH_BASE_URL` | — | Optional override base URL |
| `WEB_SEARCH_TIMEOUT_MS` | `15000` | Search timeout |
| `WEB_SEARCH_DEFAULT_LIMIT` | `10` | Default result limit |
| `WEB_SEARCH_CACHE_TTL_SECONDS` | `300` | Redis cache TTL for search results |

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start API in watch mode |
| `npm run start` | Start once (Nest CLI) |
| `npm run start:prod` | Run compiled `dist/main` |
| `npm run build` | Compile TypeScript |
| `npm run lint` | ESLint + Prettier fix |
| `npm run lint:check` | ESLint without write |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:validate` | Validate Prisma schema |
| `npm run prisma:migrate:dev` | Create/apply migrations (dev) |
| `npm run prisma:migrate:deploy` | Apply migrations (deploy) |
| `npm run prisma:seed` | Seed roles, plans, providers, demo admin |
| `npm run prisma:studio` | Open Prisma Studio |

## API documentation (Swagger)

Official interactive documentation:

**http://localhost:3000/api/docs**

Use **Authorize** with a JWT access token from `POST /api/v1/auth/login` (`Bearer <token>`).

## API overview

All routes below are under `/api/v1` unless noted.

### Auth — `/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register user + FREE subscription |
| POST | `/auth/login` | Public | Issue access + refresh tokens |
| POST | `/auth/refresh` | Public | Rotate refresh token / new access token |
| POST | `/auth/logout` | JWT | Revoke refresh session(s) |
| GET | `/auth/me` | JWT | Current user profile |
| GET | `/auth/verify-email?token=` | Public | Verify via email link |
| POST | `/auth/verify-email` | Public | Verify via body token |
| POST | `/auth/resend-verification` | Public | Resend verification email |

### Users — `/users`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users/me` | JWT | Get profile |
| PATCH | `/users/me` | JWT | Update profile |
| PATCH | `/users/me/password` | JWT | Change password (revokes sessions) |
| DELETE | `/users/me` | JWT | Soft-delete account |
| GET | `/users` | JWT + ADMIN | Paginated user list |
| GET | `/users/:id` | JWT + ADMIN | User by id |

### Subscriptions — `/subscriptions`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/subscriptions/plans` | Public | Active plans |
| GET | `/subscriptions/me` | JWT | Current subscription |
| GET | `/subscriptions/status` | JWT | Usage + remaining requests |
| POST | `/subscriptions/upgrade` | JWT | Upgrade plan |
| POST | `/subscriptions/downgrade` | JWT | Schedule downgrade |

`requestLimit = null` means unlimited. Quota is enforced with HTTP **429** on chat send and web search.

### AI providers — `/providers` and `/admin/ai-providers`

**User**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/providers` | List active system providers |
| GET | `/providers/me` | List own provider configs |
| PUT | `/providers/me/:providerId` | Upsert own config / encrypted key |
| POST | `/providers/me/:providerId/default` | Set user default |
| DELETE | `/providers/me/:providerId` | Delete own config |

**Admin** (`/admin/ai-providers`, ADMIN required): create, list, get, update, enable/disable, set default, health-check, delete.

Raw API keys are never returned; responses may include a masked `keyPreview`.

### Chat — `/conversations`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/conversations` | Create |
| GET | `/conversations` | Paginated list |
| GET | `/conversations/:id` | Detail + recent messages |
| PATCH | `/conversations/:id` | Update |
| DELETE | `/conversations/:id` | Soft-delete |
| GET | `/conversations/:id/messages` | Paginated messages |
| POST | `/conversations/:id/messages` | Chat (subscription guard) |
| POST | `/conversations/:id/messages/stream` | SSE stream (subscription guard) |

Streaming emits `event: chunk|done|error` with JSON `data` payloads. Failed streams do not consume successful subscription quota.

### Web search — `/web-search`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/web-search` | Search (subscription guard) |
| GET | `/web-search/history` | Paginated history |
| GET | `/web-search/recent` | Recent searches |
| GET | `/web-search/suggestions` | Suggestions from history |
| GET | `/web-search/:id` | One owned record |
| DELETE | `/web-search/:id` | Delete owned record |

Redis caching is an internal optimization and is not required by clients.

### Admin — `/admin` (JWT + ADMIN)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/dashboard` | Nested dashboard statistics |
| GET | `/admin/users` | List/search/filter users |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id/status` | Activate / deactivate |
| PATCH | `/admin/users/:id/role` | Change USER/ADMIN |
| GET | `/admin/users/:id/subscription` | Active subscription |
| GET | `/admin/users/:id/usage` | Usage summary |
| GET | `/admin/usage` | Usage analytics |
| GET | `/admin/logs` | Paginated request logs |
| GET | `/admin/system/health` | System + provider status |
| * | `/admin/subscription-plans` | Plan list/create/update |
| * | `/admin/subscriptions` | List/get/update status |
| * | `/admin/ai-providers` | Provider management |

### Health — `/health`

`GET /api/v1/health` — database is critical (**503** when down). Redis and SMTP are informational and do not fail overall status when unavailable.

## Subscription and usage

- Registration provisions an active **FREE** subscription in a transaction.
- Plans are stored as `SubscriptionPlan` (`free`, `premium` seeded).
- Status values: `ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `EXPIRED`.
- Usage is counted dynamically from successful (`2xx`/`3xx`) `APIUsageLog` rows in the billing window `[currentPeriodStart, currentPeriodEnd)`.
- Failed provider calls may still be logged for analytics but **do not** consume quota.
- There are no duplicated `currentUsage` / `remainingRequests` columns in the database.
- `SubscriptionUsageGuard` protects chat send and web search.

## Security notes

- Passwords hashed with bcrypt; refresh and verification tokens stored hashed only
- AI provider keys encrypted at rest (`ENCRYPTION_KEY` → AES-256-GCM)
- Ownership checks on conversations, messages, and search history
- Admin routes require server-side `RolesGuard`
- Global validation rejects unknown body fields
- Custom security response headers applied at bootstrap
- Secrets must not appear in Swagger examples, logs, or Git (use `.env.example` placeholders only)

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires configured DATABASE_URL / migrations)
npm run test:e2e
```

E2E setup forces `EMAIL_MOCK=true` and raises `THROTTLE_LIMIT` so tests do not send real mail or hit default rate limits. Use `AI_COMPLETION_MOCK` / `WEB_SEARCH_MOCK` when live providers are unavailable.

## Docker

Docker is **optional**. Use it only if you prefer containers over a local PostgreSQL install.

**PostgreSQL only (required database via Compose):**

```bash
docker compose up -d postgres
```

**Redis only (optional):**

```bash
docker compose up -d redis
```

**PostgreSQL + Redis (optional convenience):**

```bash
docker compose up -d postgres redis
```

**Full stack (API + Postgres + Redis):**

```bash
# Ensure .env is filled
docker compose --profile full up -d --build
```

The `api` service is behind Compose profile `full`. That profile wires Compose Postgres and Redis into the API container; for a normal local Node process you only need PostgreSQL (and Redis only if you enable it).

## Known limitations

- No payment gateway (subscription upgrade/downgrade is application-level only)
- Redis and SMTP are optional; core API remains available without them
- Gemini streaming falls back to a non-stream completion then emits the full text
- Search result caching depends on Redis when configured

## License

Private / unlicensed (`UNLICENSED` in `package.json`).
