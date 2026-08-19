# Execution Order — Build Phases

Scope note: audit logging is limited to payment-critical events only
(payments, refunds, subscription state changes). Content/user CRUD is not audited.

## Phase 1: Foundation + Content CRUD ✅ DONE

- [x] Schema layer — 10 tables, RLS on audit_logs, migrations applied
- [x] Auth — OAuth (Google/GitHub), Redis sessions, global guards, @Public()/@Roles
- [x] Users module — find-or-create, soft delete
- [x] Articles module — CRUD, publish/unpublish, soft delete, query filters
- [x] Common infra — exception filter, response envelope, Zod pipe, logging

## Phase 2: One-Time Purchase (End-to-End)

Goal: Guest buys an article → webhook confirms → email sent.

- [ ] Payments module — PaystackProvider (initialize, verify, refund) via axios
- [ ] Orders + Transactions — create order/transaction, Redis idempotency key
- [ ] Webhooks — raw body + HMAC-SHA512 verification, webhook_events storage, dedupe
- [ ] RabbitMQ module + Mail module (Brevo SMTP)
- [ ] Workers — webhook worker, mail worker
- [ ] Audit logs wired to payment events (PAYMENT_SUCCESS, PAYMENT_FAILED, REFUND_*)

## Phase 3: Subscriptions

Goal: User subscribes, auto-renewal, retry logic, suspension.

- [ ] Subscriptions module — initiate, cancel, state machine
- [ ] Scheduler service — hourly renewal check, retry (past_due → suspended)
- [ ] Audit logs for subscription state changes (SUBSCRIPTION_*)

## Phase 4: Admin Operations

- [ ] Admin controllers — orders, transactions, refunds, subscriptions
- [ ] Reconciliation service — daily Paystack comparison

## Phase 5: Observability

- [ ] Rate limit interceptor (Redis sliding window)
- [ ] Prometheus metrics endpoint
- [ ] Article listing cache in Redis
