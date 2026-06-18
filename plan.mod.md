# Plan Modifications — v3.1

## 1. Orders & Transactions Split

**Original (plan.md):** One `orders` table holds both business intent and payment attempt. Each retry creates a new order row. Status enum: `pending | processing | success | failed | refund_initiated | refunded`.

**Change:** Split into two tables — `orders` (business intent) and `transactions` (payment attempt).

### orders (business intent)
```
One row per purchase intent. Admin sees one row per purchase.
Status reflects overall outcome.

id              UUID PK
user_id         UUID → users (nullable, for authenticated users)
email           VARCHAR(255) NOT NULL (guest email or user's email at time of purchase)
article_id      UUID → articles (nullable)
plan_id         UUID → plans (nullable)
amount          BIGINT NOT NULL
currency        VARCHAR(10) NOT NULL
status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                pending | success | failed | refunded
refunded_at     TIMESTAMPTZ
created_at, updated_at

CHECK: article_id IS NOT NULL OR plan_id IS NOT NULL
```

### transactions (payment attempt)
```
One row per payment attempt. Linked to an order.
On retry, create new transaction for same order — no re-charge.

id                    UUID PK
order_id              UUID → orders (NOT NULL)
paystack_reference    VARCHAR(255) UNIQUE
idempotency_key       VARCHAR(255) NOT NULL UNIQUE
status                VARCHAR(50) NOT NULL DEFAULT 'pending'
                      pending | success | failed
amount                BIGINT NOT NULL
currency              VARCHAR(10) NOT NULL
failure_reason        TEXT
value_delivered       BOOLEAN NOT NULL DEFAULT false
delivered_at          TIMESTAMPTZ
gateway_response      JSONB (raw Paystack response for debugging/replay)
metadata              JSONB (flexible — payment method used, etc.)
created_at, updated_at
```

### State mapping

| Original orders status | New mapping |
|---|---|
| pending | 1 transaction exists with status = pending |
| processing | removed — covered by transaction processing |
| success | order = success when at least 1 transaction = success AND value_delivered = true |
| failed | all transactions have failed |
| refund_initiated | removed — covered by transaction-level refund tracking |
| refunded | order = refunded |

### Retry flow
```
Order created (pending)
  → Transaction #1 created → user pays → webhook: success
  → Delivery attempt fails → transaction.value_delivered = false
  → User clicks "retry"
  → Delivery re-runs on same transaction (no new charge)
  → If delivery succeeds: transaction.value_delivered = true, order.status = success
  → If delivery fails again: user can keep retrying
```

**Why this is better:**
- Admin dashboard: one row per purchase, not one row per payment attempt
- Retry is re-delivery, not re-payment — the business model is preserved
- Transaction history is visible but not mixed into the order list
- Reconciliation maps 1:1 to Paystack's own transaction list
- The `value_delivered` flag is explicit rather than implied by order status

---

## 2. Removed sessions table

**Original (plan.md):** `sessions` table for audit trail of login/logout.

**Decision:** Do not create. Redis is the session store. Audit logs capture important auth events. A sessions table adds DB maintenance for marginal audit value at this scale.

---

## 3. Subscription status enum cleanup

**Original schema had:** `initiated | active | past_due | suspended | cancelled | expired | non_renewing`

**Changes:**
- Remove `expired` — no concrete transition exists in the state machine. A subscription naturally ends as `cancelled` or `suspended`.
- Keep `non_renewing` — real Paystack state. Subscription is active but will not auto-renew after current period. Maps to a known Paystack callback.

**Final subscription statuses:** `initiated | active | past_due | suspended | cancelled | non_renewing`

---

## 4. Impact on plan.md sections

| Section | Impact |
|---|---|
| §10 Folder Structure | Add `src/modules/orders/entities/transaction.entity.ts`, `repositories/transactions.repository.ts` |
| §11 DTOs | Order DTOs reference transactions for status. Add `transaction_id` to responses. |
| §12 Database Schema | Replace orders schema with split above. Remove sessions. Update subscriptions. |
| §13 API Contract | GET /orders/:id returns order + latest transaction. Admin GET /orders/:id returns order + all transactions. |
| §14 System Flows | Order creation creates order row + transaction row. Delivery webhook updates transaction.value_delivered. Retry flow re-triggers delivery, not payment. |
| §15 Message Queue | No change — workers reference transaction.id for delivery context. |
| §16 Subscription State Machine | No change — non_renewing is a terminal-adjacent state (active until period end, then no renewal). |
| §17 Transaction State Machine | Simplified: pending → success/failed. No refund_initiated (handled at order level). |
| §23 Out of Scope | No change. |

---

## 5. New/modified indexes

### orders
```
idx_orders_email ON email
idx_orders_status ON status
idx_orders_user_id ON user_id
idx_orders_created_at ON created_at DESC
```

### transactions
```
idx_transactions_order_id ON order_id
idx_transactions_status ON status
idx_transactions_created_at ON created_at DESC
UNIQUE(paystack_reference)
UNIQUE(idempotency_key)
```

---

## 6. Subscription UNIQUE constraint

**Original schema missing:** `UNIQUE(user_id, plan_id)` — plan specifies "one active subscription per user at a time." Not a DB-level unique on (user_id, plan_id) since a user can cancel and resubscribe to the same plan (multiple rows over time with different statuses). The constraint should ensure no two rows have the same (user_id, plan_id) where both are active/initiated/past_due/non_renewing.

**Decision:** Partial unique index:
```sql
CREATE UNIQUE INDEX idx_subscriptions_active_unique
  ON subscriptions(user_id, plan_id)
  WHERE status IN ('initiated', 'active', 'past_due', 'non_renewing');
```

This enforces one active subscription per user per plan at the DB level, while allowing historical cancelled/suspended rows.
