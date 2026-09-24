# EchoGPT Backend Engineering Guidelines

## Project

EchoGPT Backend REST API for the EchoGPT Chrome Extension.

## Technology Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Swagger/OpenAPI
- Docker
- Jest

## Architecture

Follow a clean, modular NestJS architecture.

Use:

Controller
→ Service
→ Prisma
→ PostgreSQL

Controllers must not contain business logic.

Controllers must never access Prisma directly.

Business logic belongs in services.

Keep modules isolated and maintainable.

## Code Quality

Follow:

- SOLID principles
- DRY
- KISS
- Clean Code
- Strong typing
- Explicit DTOs
- Meaningful naming
- Small focused methods
- Reusable services where appropriate

Avoid:

- unnecessary abstractions
- duplicated logic
- giant services
- giant controllers
- any types
- hardcoded configuration
- dead code
- TODO placeholders
- unrelated refactoring

## Security

Always consider:

- JWT authentication
- Refresh token security
- Password hashing
- RBAC
- Input validation
- Rate limiting
- CORS
- Helmet
- Environment variables
- API key encryption
- Secure error responses

Never expose:

- password hashes
- refresh token hashes
- API keys
- secrets
- environment credentials

## Database

Use PostgreSQL with Prisma.

Use:

- normalized relational design
- foreign keys
- appropriate indexes
- unique constraints
- transactions where required
- pagination for list endpoints

Avoid N+1 queries.

## API

All APIs must use:

/api/v1

Follow RESTful conventions.

Use DTOs for request validation.

Keep response structures consistent.

## Error Handling

Use centralized exception handling.

Never expose internal database errors or sensitive implementation details.

## Swagger

Every API endpoint must be properly documented with:

- Summary
- Description
- Parameters
- Request body
- Authentication
- Success responses
- Error responses

## Scalability

Design components so that future providers/features can be added without rewriting existing business logic.

AI providers must use an abstraction/adapter approach.

## Testing

After implementation:

- run TypeScript build
- run ESLint
- run relevant tests
- run Prisma validation when database changes
- verify application startup

Do not consider a task complete if the project does not build successfully.

## Git

Use meaningful Conventional Commit messages.

Examples:

feat: implement user registration

fix: handle expired refresh tokens

refactor: extract AI provider interface

test: add authentication service tests

docs: update Swagger documentation

chore: configure Docker environment

## Implementation Rules

Before changing code:

1. Inspect the existing implementation.
2. Understand existing architecture.
3. Reuse existing utilities and patterns.
4. Do not modify unrelated code.
5. Do not introduce dependencies without justification.

After changing code:

1. Review the implementation.
2. Run validation/build/lint/tests.
3. Fix errors.
4. Check for security issues.
5. Summarize the changes.