# Vaultpay API

Payment platform for premium articles and newsletters — one-time purchases and recurring subscriptions, processed via Paystack. Guests can buy individual articles with just an email; authenticated users (Google/GitHub OAuth) can subscribe to plans for auto-delivered content.

## Tech Stack

| Layer            | Technology                      |
| ---------------- | ------------------------------- |
| Framework        | NestJS 11 (Node 20, TypeScript) |
| Database         | PostgreSQL 15 + Drizzle ORM     |
| Cache / Sessions | Redis 7                         |
| Message Broker   | RabbitMQ 3.12                   |
| Payments         | Paystack                        |
| Email            | Brevo (SMTP)                    |
| Auth             | OAuth 2.0 — Google & GitHub     |

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL, Redis, RabbitMQ)

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in your OAuth credentials and mail settings (see .env.example comments)

# 3. Start infrastructure (postgres, redis, rabbitmq)
docker compose up -d

# 4. Apply database migrations
pnpm db:migrate

# 5. Start the dev server
pnpm start:dev
```

## Verify It Works

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Testing

```bash
# Unit tests
pnpm test

# Integration tests (requires Docker services running)
pnpm test:integration
```

## Project Structure

```
src/
├── common/          # Guards, interceptors, pipes, filters, decorators
├── config/          # Environment configuration
├── modules/         # Feature modules (auth, users, articles, audit-logs, ...)
├── shared/          # Infrastructure clients (database, redis) + Drizzle schemas
└── workers/         # RabbitMQ consumers (planned)
```

Each module owns its controller, service, repository, and validation schemas. Cross-module communication happens through injected services only.
