# Execution Order — Build Phases

## Phase 1: Foundation + Admin CRUD

Goal: Audit logging wired, articles and plans manageable via admin.

- [ ] **Audit logs service** — `audit-logs.module.ts`, `audit-logs.service.ts`, `audit-logs.repository.ts`
- [ ] **Articles module** — CRUD, publish/unpublish, admin controller
- [ ] **Plans module** — CRUD, activate/deactivate, admin controller

## Phase 2: One-Time Purchase (End-to-End)

Goal: Guest buys an article → webhook confirms → email sent with article.

- [ ] **Payments module** — `BasePaymentProvider` interface, `PaystackProvider`, `payments.service`
- [ ] **Orders module** — create order, create transaction, status tracking
- [ ] **Webhooks module** — HMAC verification, event storage, queue publishing
- [ ] **RabbitMQ module** — `rabbitmq.module.ts`, `rabbitmq.service.ts`, exchange/queue setup
- [ ] **Workers** — `webhook.worker.ts`, `mail.worker.ts`
- [ ] **Mail module** — `mail.module.ts`, `mail.service.ts` (Brevo/SMTP)

## Phase 3: Subscriptions

Goal: User subscribes, auto-renewal, retry logic, suspension.

- [ ] **Subscriptions module** — initiate, cancel, status management
- [ ] **Scheduler service** — hourly renewal check, retry logic, state machine
- [ ] **Subscription admin controller** — cancel, reactivate, list

## Phase 4: Admin + Support

Goal: Full admin panel, complaint handling, data integrity.

- [ ] **Admin controllers** — orders, complaints, audit logs
- [ ] **Complaints module** — submit, resolve, refund trigger
- [ ] **Reconciliation service** — daily job, Paystack comparison

## Phase 5: Observability

Goal: Metrics, alerts, rate limiting.

- [ ] **Rate limit interceptor** — Redis sliding window
- [ ] **Prometheus metrics** — HTTP, business, infra metrics
- [ ] **Caching** — article listing cache in Redis
