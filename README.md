# EchoGPT Backend API

REST API for the EchoGPT Chrome extension. It covers authentication, user accounts, subscription plans and usage limits, AI provider configuration, chat, web search, and admin management.

All routes are versioned under `/api/v1`. Interactive API docs are available in Swagger.

## Technology stack

| Technology | Role |
| --- | --- |
| NestJS + TypeScript | HTTP API |
| PostgreSQL + Prisma | Database, migrations, and seed |
| JWT + bcrypt | Access tokens and password hashing |
| class-validator | Request validation |
| Swagger / OpenAPI | API documentation |
| Jest + Supertest | Unit and end-to-end tests |
| Docker Compose | Optional PostgreSQL, Redis, and API |
| Nodemailer | Email verification (optional SMTP) |
| Redis | Optional search cache and rate-limit storage |

## Implemented features

- Registration, login, JWT access tokens, and rotating refresh tokens
- Logout and session revocation
- Role-based access (`USER`, `ADMIN`)
- Profile, password change, account status, and soft delete
- Free and Premium plans, upgrade/downgrade, billing period, and remaining requests
- Usage counted from successful API logs and enforced on chat and web search
- AI providers: OpenAI, Claude, and Gemini, with encrypted API keys
- User provider configuration, system default, enable/disable, and health check
- Persistent conversations and messages, with ownership checks
- Web search with history, recent searches, and suggestions
- Admin dashboard, users, subscriptions, providers, usage analytics, request logs, and system health
- Swagger documentation for every endpoint
- Global HTTP rate limiting

### Bonus features

| Feature | What it does |
| --- | --- |
| Email verification | Verification email, verify link/token, and resend. SMTP is optional. |
| Streaming chat (SSE) | `POST /conversations/:id/messages/stream` emits `chunk`, `done`, and `error` events. |
| Redis search caching | Caches web-search results when `REDIS_HOST` is set. The API still runs if Redis is off. |

OpenAI and Claude stream response chunks. Gemini returns the completed response as a single SSE event.

## Authentication

Public registration and login. Protected routes use a JWT access token. Refresh tokens are stored hashed, rotated on refresh, and revoked on logout. Password changes also revoke sessions.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public |
| POST | `/auth/logout` | JWT |
| GET | `/auth/me` | JWT |
| GET | `/auth/verify-email` | Public |
| POST | `/auth/verify-email` | Public |
| POST | `/auth/resend-verification` | Public |

Set `REQUIRE_EMAIL_VERIFICATION=true` to block login until the email is verified. The default is `false`.

## User management

Users can view and update their own profile, change their password, and soft-delete their account. The client cannot set another user’s id. Admins can list users and open a user by id.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/users/me` | JWT |
| PATCH | `/users/me` | JWT |
| PATCH | `/users/me/password` | JWT |
| DELETE | `/users/me` | JWT |
| GET | `/users` | Admin |
| GET | `/users/:id` | Admin |

## Subscription management

Registration creates an active Free subscription. Plans expose a request limit (`null` means unlimited). Remaining requests are calculated from successful usage in the current billing period. There is no payment gateway.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/subscriptions/plans` | Public |
| GET | `/subscriptions/me` | JWT |
| GET | `/subscriptions/status` | JWT |
| POST | `/subscriptions/upgrade` | JWT |
| POST | `/subscriptions/downgrade` | JWT |

Chat and web search return **429** when the plan limit is reached. Failed provider calls are logged and do not consume quota.

## AI provider management

System providers are managed by admins. Users can save their own provider settings. API keys are encrypted with AES-256-GCM and are never returned in responses (a masked preview may be shown).

**User** (`/providers`, JWT)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/providers` | List active providers |
| GET | `/providers/me` | List own configs |
| PUT | `/providers/me/:providerId` | Save config and key |
| POST | `/providers/me/:providerId/default` | Set personal default |
| DELETE | `/providers/me/:providerId` | Remove own config |

**Admin** (`/admin/ai-providers`): create, list, get, update, enable/disable, set the system default, run a health check, and delete.

## Chat API

Conversations and messages belong to the signed-in user. Each request can select a provider and model. Successful chats are written to usage logs.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/conversations` | Create |
| GET | `/conversations` | List (paginated) |
| GET | `/conversations/:id` | Get one |
| PATCH | `/conversations/:id` | Update |
| DELETE | `/conversations/:id` | Soft-delete |
| GET | `/conversations/:id/messages` | Message history |
| POST | `/conversations/:id/messages` | Send a prompt |
| POST | `/conversations/:id/messages/stream` | Stream the reply (SSE) |

## Web Search API

Search runs through the configured provider (Serper by default), stores the user’s history, and counts toward the subscription limit.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/web-search` | Run a search |
| GET | `/web-search/history` | History (paginated) |
| GET | `/web-search/recent` | Recent searches |
| GET | `/web-search/suggestions` | Suggestions from history |
| GET | `/web-search/:id` | One owned record |
| DELETE | `/web-search/:id` | Delete an owned record |

## Admin APIs

Every `/admin` route requires a JWT with the `ADMIN` role.

| Area | Paths |
| --- | --- |
| Dashboard | `GET /admin/dashboard` |
| Users | `GET /admin/users`, `GET /admin/users/:id`, status, role, subscription, usage |
| Usage and logs | `GET /admin/usage`, `GET /admin/logs` |
| System health | `GET /admin/system/health` |
| Plans | `GET/POST /admin/subscription-plans`, `PATCH /admin/subscription-plans/:id` |
| Subscriptions | `GET /admin/subscriptions`, `GET /admin/subscriptions/:id`, `PATCH .../status` |
| Providers | `/admin/ai-providers` |

`GET /api/v1/health` is public. The database is required (**503** when it is down). Redis and SMTP are reported but do not fail the overall status.

## Swagger / OpenAPI

**http://localhost:3000/api/docs**

1. Call `POST /api/v1/auth/login`.
2. Copy `accessToken` from the response.
3. In Swagger, click **Authorize** and paste the token.

Swagger sends `Authorization: Bearer <token>`. Request and response schemas, auth requirements, and error codes are documented on each operation.

## Database

PostgreSQL with Prisma. The schema, seed script, and migration files are in the repository:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/`

Main models: User, Role, Session, EmailVerificationToken, SubscriptionPlan, Subscription, AIProvider, UserAIProvider, Conversation, Message, WebSearch, APIUsageLog.

The seed creates `USER` and `ADMIN` roles, Free and Premium plans, OpenAI / Claude / Gemini provider records (without API keys), and one admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Environment variables

`.env.example` is included. Copy it to `.env` and do not commit `.env`.

**Required**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Access-token signing secret |
| `ENCRYPTION_KEY` | Secret used to encrypt provider API keys |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials for the seeded admin (required to run the seed) |

**Common optional settings**

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Block login until verified |
| `REDIS_HOST` | empty | Empty disables Redis |
| `WEB_SEARCH_API_KEY` | — | Search provider key |
| `WEB_SEARCH_MOCK` | `false` | Return mock search results |
| `AI_COMPLETION_MOCK` | `false` | Return mock AI replies |
| `SMTP_HOST` and related | — | Real verification email. Leave unset to skip SMTP. |

See `.env.example` for SMTP, Redis, rate-limit, and timeout variables.

## Installation and setup

**Prerequisites:** Node.js 22+, npm, and PostgreSQL (local or Docker).

```bash
git clone <repository-url>
cd echogpt
npm install
cp .env.example .env
```

Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`.

Start PostgreSQL, then apply the included migrations and seed:

```bash
docker compose up -d postgres
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

| Resource | URL |
| --- | --- |
| API | http://localhost:3000/api/v1 |
| Health | http://localhost:3000/api/v1/health |
| Swagger | http://localhost:3000/api/docs |

Docker PostgreSQL defaults: user `echogpt`, password `echogpt`, database `echogpt`, port `5432`.

```env
DATABASE_URL=postgresql://echogpt:echogpt@localhost:5432/echogpt?schema=public
```

For a local PostgreSQL install, point `DATABASE_URL` at that server and run the same Prisma commands. Docker is not required.

Log in as the seeded admin with the email and password from `.env`.

## Docker

```bash
docker compose up -d postgres          # database
docker compose up -d redis             # optional cache
docker compose up -d postgres redis    # both
docker compose --profile full up -d --build   # API + PostgreSQL + Redis
```

Redis is optional. To enable it, set `REDIS_HOST=127.0.0.1` and `REDIS_PORT=6379`, leave `REDIS_PASSWORD` empty for the Compose container, and restart the API. `.env` is read only at startup.

## Testing

```bash
npm test          # unit tests
npm run test:e2e  # end-to-end tests (needs DATABASE_URL and applied migrations)
npm run build
npm run lint:check
```

End-to-end tests force `EMAIL_MOCK=true`. Use `AI_COMPLETION_MOCK=true` and `WEB_SEARCH_MOCK=true` when live AI or search keys are not configured.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Development server |
| `npm run start:prod` | Run the production build |
| `npm run build` | Compile TypeScript |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |
| `npm run prisma:migrate:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed roles, plans, providers, and admin |
