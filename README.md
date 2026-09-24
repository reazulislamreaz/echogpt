# EchoGPT Backend

Production-oriented NestJS REST API for the EchoGPT Chrome Extension.

## Stack

- NestJS + TypeScript (strict)
- PostgreSQL + Prisma
- JWT Authentication (prepared)
- Swagger/OpenAPI
- Docker
- Jest + ESLint + Prettier

## Getting started

```bash
cp .env.example .env
npm install
npx prisma generate
docker compose up -d postgres
npm run start:dev
```

- API base: `http://localhost:3000/api/v1`
- Health: `GET /api/v1/health`
- Swagger: `http://localhost:3000/api/docs`

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run lint` | ESLint + Prettier fix |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run prisma:generate` | Generate Prisma Client |

## Project structure

```
src/
  auth/ users/ roles/ sessions/ subscriptions/
  providers/ chat/ search/ usage/ admin/
  health/ prisma/ common/
```

Domain modules are organized cleanly by domain.

## Subscription & Usage Architecture (Step 7)

### Subscription Lifecycle
- **Plans**: Stored dynamically in PostgreSQL (`SubscriptionPlan`). Supported default tiers include `FREE` (free, 50 requests/month by default) and `PREMIUM` (paid, 1000 requests/month by default), plus custom plans.
- **Auto-Provisioning**: Upon user registration, a `FREE` tier subscription is automatically created in an active state within a database transaction.
- **Status Lifecycle**: `ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `EXPIRED`.
  - When a user cancels, `canceledAt` is recorded, but access is retained until `currentPeriodEnd`.
  - When `currentPeriodEnd` passes, the service automatically expires or advances periods depending on subscription policy.

### Usage Calculation & Billing Boundaries
- **Dynamic Metering**: Requests are computed dynamically from `APIUsageLog` with a PostgreSQL database-level `COUNT` aggregate.
- **No Duplicated State**: Neither `remainingRequests` nor `currentUsage` are stored as redundant columns.
- **Calendar-Aware Billing Period**: Intervals use the half-open interval `[currentPeriodStart, currentPeriodEnd)`.
- **System Isolation**: System logs with `userId = NULL` and background tasks are excluded from user quota calculations.

### Request Allowance & Limit Enforcement
- **Limit Enforcement**: `checkRequestAllowance(userId)` compares dynamic usage against `plan.requestLimit`.
- **Unlimited Plans**: `requestLimit = null` is treated as unlimited.
- **Quota Exceeded (HTTP 429)**: Once usage reaches or exceeds `requestLimit`, an `HttpException(HttpStatus.TOO_MANY_REQUESTS)` is raised with code `SUBSCRIPTION_LIMIT_EXCEEDED`.
- **Reusable Guard**: `SubscriptionUsageGuard` is exported for use by downstream Chat, AI, and Web Search endpoints.

### Upgrade & Downgrade Behavior
- **Upgrade (`POST /subscriptions/upgrade`)**: Instantly transitions the user to the target plan within a database transaction, updates `currentPeriodStart` and `currentPeriodEnd` according to the new billing cycle, and preserves transition history.
- **Downgrade (`POST /subscriptions/downgrade`)**: If downgrading to `FREE` or another lower tier, the change is scheduled or immediately processed cleanly without duplicate active records.
- **Idempotency**: Attempting to upgrade to the already active plan is rejected with a 409 Conflict.

### Concurrency & Performance
- **Indexed Access**: API usage queries utilize composite index `(user_id, created_at)` for high throughput counting.
- **Concurrency Trade-Off**: For Step 7, quota checks utilize PostgreSQL read-aggregation and transaction isolation. High-throughput distributed atomic reservation (e.g., Redis distributed token buckets or advisory locks) can be added in future scaling iterations if sub-millisecond edge collisions require strict zero-overshoot guarantees.

