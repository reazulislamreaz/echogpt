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

Domain modules are scaffolded as empty Nest modules. Business logic will be added in later iterations.
