# Vaultpay Inc. — Complete System Design Document

**Version:** 3.0
**Status:** Locked
**Stack:** NestJS · PostgreSQL · Redis · RabbitMQ · Paystack · Brevo · Docker
**Date:** May 2026
**Author:** Engineering Team

---

> **How to read this document**
> Every significant decision includes a **Why** block explaining the reasoning and tradeoffs considered.
> If you return to this document after weeks or months, you will know not just _what_ was decided
> but _why_ — so you can challenge it with new information rather than blindly follow it.

---

## Table of Contents

1. Project Overview
2. Glossary
3. Actors & Roles
4. Authentication & Session Management
5. Product Model
6. Functional Requirements
7. Non-Functional Requirements
8. Infrastructure & Services
9. Honest Scale Analysis
10. Folder Structure
11. DTOs & Validation
12. Database Schema
13. API Contract
14. System Flows
15. Message Queue Design
16. Subscription State Machine
17. Transaction State Machine
18. Caching Strategy
19. Monitoring & Observability
20. Failure Handling & Blast Radius
21. Scaling Plan
22. High-Level System Architecture
23. Explicitly Out of Scope

---

## 1. Project Overview

Vaultpay Inc. is a premium article and newsletter platform. Customers can purchase individual articles as one-time buys, or subscribe to recurring plans that automatically deliver newly published articles to their email.

This document is the complete, production-grade system design for the Vaultpay payment platform. Every decision is intentional and explained. No decision is made because it sounds professional — each one has a concrete reason tied to the system’s requirements.

**Architecture:** Monolith — one deployable NestJS application. All business logic, background workers, and scheduled jobs live in one codebase and one deployment unit.

**Why a monolith and not microservices?**
Microservices solve problems that arise at scale — independent deployability, team autonomy, independent scaling of components. At Vaultpay’s current scale (one developer, early users, ~100 tx/day), microservices would introduce network latency between services, distributed tracing complexity, multiple deployment pipelines, and inter-service authentication — all overhead with zero benefit. A well-structured monolith with clear module boundaries gives you 90% of microservices’ architectural benefits with 10% of the operational cost. If the system needs to split later, the module boundaries defined here make extraction straightforward.

**Primary learning goals:**

- Understand how payment systems work end-to-end: webhooks, idempotency, state machines, reconciliation
- Build at production quality — the same quality as the Kwuflow API, matching or exceeding its patterns
- Understand RabbitMQ, Redis, and PostgreSQL as infrastructure tools, not abstractions
- Be able to work confidently on production NestJS payment backends

---

## 2. Glossary

| Term                 | Full Meaning                                 | Plain Explanation                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OAuth 2.0**        | Open Authorization 2.0                       | Lets users log in with Google/GitHub without giving us their password. We verify their identity without owning their credentials.                                                                                                                          |
| **CSRF**             | Cross-Site Request Forgery                   | An attack where a malicious site tricks your browser into making a request to another site you are logged into. The OAuth state parameter prevents this during login.                                                                                      |
| **State parameter**  | —                                            | A random string generated before an OAuth redirect, stored server-side, and verified when the OAuth provider calls back. Proves the callback is genuine and not forged.                                                                                    |
| **Webhook**          | HTTP callback                                | Paystack calls our server URL to tell us a payment result. We do not ask — they tell us. Like a bank calling you instead of you calling the bank every second.                                                                                             |
| **Idempotency**      | —                                            | Doing the same operation twice produces the same result. If Paystack sends the same webhook twice, we process the payment once, not twice.                                                                                                                 |
| **RabbitMQ**         | —                                            | A message broker. A reliable middleman that holds messages in queues until a worker picks them up. If the worker crashes, the message stays in the queue — nothing is lost.                                                                                |
| **DLQ**              | Dead Letter Queue                            | Where RabbitMQ sends messages that failed all retry attempts. They are parked for manual inspection — not lost, not silently discarded.                                                                                                                    |
| **ACK**              | Acknowledgement                              | A signal sent to RabbitMQ after successfully processing a message. Only after ACK does RabbitMQ remove the message. If the worker crashes before ACK, the message is requeued.                                                                             |
| **NACK**             | Negative Acknowledgement                     | Signal sent to RabbitMQ when processing failed. RabbitMQ requeues the message for retry.                                                                                                                                                                   |
| **Redis**            | Remote Dictionary Server                     | An in-memory key-value store. Extremely fast (microsecond reads). Used for sessions, idempotency keys, rate limiting, and caching. Data lives in RAM.                                                                                                      |
| **HMAC**             | Hash-based Message Authentication Code       | A cryptographic signature. Paystack computes a hash of the webhook body using a shared secret and attaches it. We verify this hash to confirm the webhook is genuinely from Paystack.                                                                      |
| **PCI-DSS**          | Payment Card Industry Data Security Standard | Global security rules for systems that handle card data. We comply by never touching card data — Paystack does. Our obligation: do not store what you do not need.                                                                                         |
| **Prometheus**       | —                                            | An open-source tool that scrapes numeric metrics from your running application on a schedule and stores them as time-series data.                                                                                                                          |
| **Grafana**          | —                                            | A dashboard tool that reads from Prometheus and displays metrics as charts and graphs.                                                                                                                                                                     |
| **Alertmanager**     | —                                            | Routes alerts from Prometheus to email or Slack when a metric crosses a threshold you defined.                                                                                                                                                             |
| **DTO**              | Data Transfer Object                         | A class that defines the exact shape of data entering or leaving an endpoint. Not stored in the DB — it is the contract between client and API.                                                                                                            |
| **Zod**              | —                                            | A TypeScript-first schema validation library. Define a schema once — get both runtime validation and compile-time type inference from the same definition.                                                                                                 |
| **Guard**            | —                                            | A NestJS mechanism that runs before a route handler and decides whether the request is allowed to proceed.                                                                                                                                                 |
| **Interceptor**      | —                                            | A NestJS mechanism that wraps a route handler. Runs code before (e.g. start timer) and after (e.g. format response, log duration).                                                                                                                         |
| **Pipe**             | —                                            | A NestJS mechanism that validates and transforms incoming data before it reaches the route handler.                                                                                                                                                        |
| **Repository**       | —                                            | A class that owns all database queries for one entity. Nothing outside this class writes SQL for that entity.                                                                                                                                              |
| **Entity**           | —                                            | A class that maps to a database table and defines the shape of a row.                                                                                                                                                                                      |
| **Strategy Pattern** | —                                            | A design pattern: define a family of interchangeable algorithms behind a common interface. In Vaultpay: BasePaymentProvider defines the interface; PaystackProvider implements it. Adding Flutterwave later means adding one file, not rewriting services. |
| **Circuit Breaker**  | —                                            | A resilience pattern that stops calling a failing external service repeatedly. After N failures it opens and fails fast, giving the service time to recover.                                                                                               |
| **Reconciliation**   | —                                            | A background job comparing your DB records against Paystack’s records to find and resolve mismatches. The last line of defense against lost payments.                                                                                                      |
| **Kobo**             | —                                            | Smallest Nigerian currency unit. ₦1 = 100 kobo. All NGN amounts stored as integers in kobo. Paystack’s API also uses kobo.                                                                                                                                 |
| **SLO**              | Service Level Objective                      | An internal reliability target. Example: 99% of article list requests complete in under 200ms.                                                                                                                                                             |
| **p95 latency**      | 95th percentile latency                      | 95% of requests are faster than this number. More honest than average because outliers do not hide in the mean.                                                                                                                                            |
| **TTL**              | Time To Live                                 | How long a value stays valid before expiring and being deleted automatically.                                                                                                                                                                              |
| **DAU**              | Daily Active Users                           | Unique users who interact with the system in a given day.                                                                                                                                                                                                  |
| **VPS**              | Virtual Private Server                       | A rented virtual Linux machine. You SSH into it and install whatever you want.                                                                                                                                                                             |
| **tx/day**           | Transactions per day                         | Number of payment operations the system processes daily.                                                                                                                                                                                                   |

---

## 3. Actors & Roles

| Actor     | Description                                                                                                               | Auth Method                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Guest** | Browses free articles, makes one-time purchases without an account. Email collected at checkout only. No session created. | None                                 |
| **User**  | Authenticated via OAuth. Purchases articles, subscribes to plans, manages subscription, submits complaints.               | OAuth 2.0 — Google or GitHub         |
| **Admin** | Internal operator. Manages plans, articles, transactions, refunds, complaints. Full read access to audit logs.            | OAuth 2.0 + role = admin check in DB |

**Why OAuth for admin instead of email + password?**

Storing passwords means owning that attack surface — you must hash correctly, handle forgot-password flows securely, rotate secrets, prevent timing attacks, and protect against credential stuffing. A single mistake in any of these creates a critical vulnerability.

OAuth delegates authentication to Google and GitHub — organisations with entire security teams, hardware security keys, anomaly detection, and phishing-resistant flows. We get all of that for free.

Admin privilege in Vaultpay is enforced by checking role = admin in our database after OAuth login. Immediate revocation: delete their Redis session — they are logged out on next request. To completely remove access: set role to user in the DB. No password reset flow needed.

---

## 4. Authentication & Session Management

### 4.1 Strategy

Vaultpay uses OAuth 2.0 exclusively. No passwords stored. No custom credential management.

### 4.2 Supported Providers

- Google
- GitHub

Facebook excluded. Reason: declining developer adoption rate, more complex app review requirements, and higher-friction user experience. Low return on integration effort.

### 4.3 The OAuth Flow With CSRF Protection

```
Step 1: User clicks Sign in with Google
            ↓
Step 2: Our server generates a random state string e.g. "a1b2c3d4"
        Stores it in Redis: key="oauth_state:a1b2c3d4" value="google" TTL=10min
            ↓
Step 3: Server redirects browser to Google:
        https://accounts.google.com/oauth/authorize
          ?client_id=OUR_CLIENT_ID
          &redirect_uri=https://vaultpay.io/auth/google/callback
          &state=a1b2c3d4    ← this is CSRF protection
          &scope=email profile
            ↓
Step 4: User authenticates on Google's page
        (We never see their credentials)
            ↓
Step 5: Google redirects back to:
        https://vaultpay.io/auth/google/callback
          ?code=GOOGLE_ONE_TIME_CODE
          &state=a1b2c3d4    ← Google echoes our state back
            ↓
Step 6: Our server reads state from callback URL
        Looks up "oauth_state:a1b2c3d4" in Redis
        NOT FOUND or mismatch → reject with 403 (CSRF attempt detected)
        FOUND and matches → delete the Redis key, continue
            ↓
Step 7: Exchange code with Google:
        POST https://oauth2.googleapis.com/token { code }
        Google responds: { access_token, id_token }
        Extract: { email, name, avatar, google_user_id }
        Discard access_token immediately — we do not store it
            ↓
Step 8: Find or create user in DB:
        SELECT * FROM users WHERE provider=google AND provider_id=google_user_id
        If not found → INSERT new user row
            ↓
Step 9: Create session:
        session_token = secure random UUID
        Redis SET "session:{token}" → { user_id, role, email } TTL=7days
        INSERT into sessions table (audit trail only — not used for auth lookups)
            ↓
Step 10: Set HTTP-only Secure cookie: vaultpay_session={session_token}
         Browser stores it, sends it automatically on every subsequent request
         OAuth complete. Google is out of the picture.
```

**Why discard Google’s access token immediately?**
We use it exactly once to fetch the user profile. After that we have what we need. Storing it means handling its short expiry (~1 hour), refreshing it, and securing it — complexity with no benefit. Discard it. Our own session is the source of truth from this point.

**Why HTTP-only cookie?**
An HTTP-only cookie cannot be read by JavaScript — not by our code, not by malicious injected scripts. XSS attacks cannot steal the session token even if they execute JavaScript on the page. This is the correct and industry-standard way to store session tokens in a browser.

**Why Redis sessions and not JWT?**
JWT (JSON Web Token) is stateless — the token contains all user info and cannot be invalidated before it expires without maintaining a blacklist. For a payment platform where subscriptions can be suspended immediately and admin accounts must be revocable instantly, waiting for a JWT to expire is unacceptable. A suspended user could keep making API calls with a still-valid JWT.

Redis sessions solve this: deleting the key invalidates the session immediately. The tradeoff is one Redis lookup per authenticated request — at our scale, microseconds.

### 4.4 Session Lifecycle

```
Created:     Redis SET "session:{token}" TTL=7days
Per request: Redis GET "session:{token}" → found = authenticated, not found = 401
Logout:      Redis DEL "session:{token}" → dead immediately
Suspension:  Redis DEL "session:{token}" → user locked out on next request
```

### 4.5 Guest Checkout

Guests do not get sessions. They provide an email address at checkout. System validates the email format, stores it on the order record, sends receipt and article to that email after payment. No account created. No session. No Redis entry.

---

## 5. Product Model

### 5.1 The Product: Articles

Vaultpay sells premium written articles. Each article has a title, HTML body, optional cover image, and pricing information. Articles are either free (accessible to everyone) or paid (requires purchase or active subscription).

### 5.2 Access Types

| Access Type           | What User Gets                                                                       | Account Required           | Recurring Charge                |
| --------------------- | ------------------------------------------------------------------------------------ | -------------------------- | ------------------------------- |
| **One-Time Purchase** | Permanent access to one specific article. Delivered to email after payment.          | No — guests allowed        | No                              |
| **Subscription**      | Access to all paid articles while active. Every new article auto-delivered to email. | Yes — OAuth login required | Yes — weekly / monthly / yearly |

**Why does subscription require an account but one-time purchase does not?**
A one-time purchase is a simple transaction — pay, get the article. No ongoing management. Requiring an account would add friction that reduces conversion.

A subscription requires ongoing management: tracking renewal dates, handling failed charges, revoking access on suspension, sending recurring emails. We need a stable user identity for this. Email alone is insufficient — two people can share an email, emails change, and we need a reliable identifier for access checks. OAuth gives us a stable, provider-verified identity.

### 5.3 Subscription Plans

Admin creates and manages all plans. Fields: name, description, amount (integer kobo/cents), currency, billing interval.

Supported intervals: weekly, monthly, yearly.
Supported currencies: NGN, USD.
One active subscription per user at a time.

**Why only one active subscription per user?**
Multiple concurrent subscriptions create complex proration and access control logic. What happens when one is cancelled but not the other? Do we charge twice? The simplest correct answer: one at a time. Change plans by cancelling and resubscribing.

---

## 6. Functional Requirements

### 6.1 Article Browsing

| ID    | Requirement                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------- |
| FR-01 | Anyone (guest or user) can list published articles with cursor-based pagination, 20 per page by default |
| FR-02 | Free articles return full content to everyone                                                           |
| FR-03 | Paid articles return first 200 characters + requires_purchase: true to non-buyers                       |
| FR-04 | Authenticated users who purchased a specific article see its full content                               |
| FR-05 | Active subscribers see full content for all paid articles                                               |

### 6.2 One-Time Payments

| ID    | Requirement                                                                                   |
| ----- | --------------------------------------------------------------------------------------------- |
| FR-06 | Guest or user can initiate payment for a specific article by providing email                  |
| FR-07 | System generates a unique idempotency key per payment initiation                              |
| FR-08 | System calls Paystack to initialise payment and returns authorization URL to client           |
| FR-09 | Client redirects user to Paystack’s hosted payment page — Vaultpay never handles card details |
| FR-10 | On payment success (confirmed via webhook), article delivered to customer email with receipt  |
| FR-11 | On payment failure, customer notified by email with clear reason                              |
| FR-12 | Purchased articles permanently accessible in authenticated user’s library                     |

### 6.3 Subscriptions

| ID    | Requirement                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| FR-13 | Authenticated user can initiate subscription to an admin-created plan                                                    |
| FR-14 | Initial subscription charge goes through Paystack — subscription only becomes ACTIVE after payment confirmed via webhook |
| FR-15 | System charges subscription automatically on each renewal date via background scheduler                                  |
| FR-16 | If renewal charge fails, system retries once per day for 3 days before suspending                                        |
| FR-17 | Subscriber retains access during retry window (PAST_DUE state)                                                           |
| FR-18 | After 3 failed retries, subscription moves to SUSPENDED — access revoked, email delivery stops                           |
| FR-19 | Suspended subscriber notified by email on each failed retry and on final suspension                                      |
| FR-20 | Subscriber can cancel at any time — access continues until end of current billing period                                 |
| FR-21 | On cancellation, no further charges are made                                                                             |
| FR-22 | Admin can cancel or reactivate any subscription                                                                          |
| FR-23 | Admin creates, edits, and deactivates subscription plans                                                                 |

### 6.4 Refunds

| ID    | Requirement                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| FR-24 | System automatically initiates full refund if payment succeeded but order fulfillment failed                     |
| FR-25 | Admin can manually trigger a full refund on any successful transaction                                           |
| FR-26 | Refunds processed via Paystack to original payment instrument — Vaultpay stores no bank details                  |
| FR-27 | A transaction cannot be refunded twice — enforced at DB level via atomic status check, not just application code |
| FR-28 | Customer notified by email when refund is initiated and when Paystack confirms it complete                       |
| FR-29 | User can submit a complaint or refund request within 7 days of purchase                                          |
| FR-30 | Admin reviews complaint — approves (triggers refund) or rejects with written resolution                          |

### 6.5 Article Delivery

| ID    | Requirement                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------- |
| FR-31 | When admin publishes an article, system queues delivery to all active subscribers              |
| FR-32 | Delivery is asynchronous — publishing completes immediately, emails sent via background worker |
| FR-33 | One-time buyers receive the article immediately after payment confirmation via email           |
| FR-34 | Failed email deliveries retried up to 3 times with exponential backoff before marking failed   |
| FR-35 | Failed deliveries are logged — article remains accessible in user library                      |

### 6.6 Admin Operations

| ID    | Requirement                                                                            |
| ----- | -------------------------------------------------------------------------------------- |
| FR-36 | Admin can create, update, publish, unpublish, and soft-delete articles                 |
| FR-37 | Admin can view all transactions, subscriptions, complaints, and audit logs             |
| FR-38 | Admin can trigger refunds and cancel or reactivate subscriptions                       |
| FR-39 | Admin can inspect Dead Letter Queue entries for failed webhook events or failed emails |

### 6.7 Reconciliation

| ID    | Requirement                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------- |
| FR-40 | A scheduled reconciliation job runs every 24 hours at 2am                                             |
| FR-41 | Job fetches last 48 hours of Paystack transactions and compares against local DB records              |
| FR-42 | Any Paystack-confirmed payment with no matching SUCCESS record in DB is flagged, logged, and resolved |
| FR-43 | Reconciliation results written to reconciliation_reports table for admin review                       |

**Why reconciliation?**
Paystack retries webhook delivery for up to 72 hours. But if the server is down longer, or a webhook is permanently lost, the customer paid but our system has no record. Reconciliation is the last line of defense. It catches what webhooks miss. Every serious payment system has one.

---

## 7. Non-Functional Requirements

### 7.1 Money Safety & Correctness

| ID     | Requirement                                                                          | Why                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| NFR-01 | All payment initiations idempotent via unique keys stored in Redis with 24h TTL      | Network retries must never cause double charges                                                                          |
| NFR-02 | Webhook processing idempotent — event ID checked in Redis before processing          | Paystack can and does send the same webhook event more than once                                                         |
| NFR-03 | DB write for order must succeed before responding to client                          | A crash after responding but before writing loses the payment record permanently                                         |
| NFR-04 | Refund idempotency enforced at DB level via atomic status check inside a transaction | Application-level checks can race. DB-level atomicity with FOR UPDATE lock cannot.                                       |
| NFR-05 | All monetary amounts stored as integers — kobo for NGN, cents for USD                | Float arithmetic is not safe for money. 0.1 + 0.2 = 0.30000000000000004 in JavaScript. Integers have no rounding errors. |
| NFR-06 | Subscription billing runs on a background scheduler, not triggered by user action    | Billing must happen on time regardless of whether any user is online                                                     |

### 7.2 Security

| ID     | Requirement                                                               | Why                                                                                      |
| ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| NFR-07 | No raw card data stored — PCI-DSS compliance via Paystack                 | Paystack is the PCI-compliant vault. We must not become one.                             |
| NFR-08 | Webhook endpoint verifies Paystack HMAC-SHA512 signature on every request | Without this, any attacker who knows our webhook URL can send fake payment confirmations |
| NFR-09 | OAuth flow uses server-generated state parameter verified on callback     | Prevents CSRF attacks on the OAuth login flow                                            |
| NFR-10 | OAuth provider access tokens discarded immediately after profile fetch    | Storing them creates an unnecessary secret that expires and must be refreshed            |
| NFR-11 | Session tokens stored as HTTP-only Secure cookies only                    | HTTP-only prevents JavaScript from reading the token — XSS attacks cannot steal sessions |
| NFR-12 | All API endpoints rate-limited via Redis sliding window                   | Prevents brute force, scraping, and abuse                                                |
| NFR-13 | Admin routes require both valid session AND role = admin in DB            | A regular user session must never reach admin handlers                                   |
| NFR-14 | All secrets in environment variables — never committed to version control | One accidental public commit exposes Paystack keys, OAuth secrets, and DB credentials    |

### 7.3 Auditability

| ID     | Requirement                                                                                                                               | Why                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| NFR-15 | Every state change on orders, subscriptions, plans, and articles written to audit_logs                                                    | Financial systems require an immutable record of every change — for debugging, disputes, and legal compliance  |
| NFR-16 | Audit log is append-only — enforced by PostgreSQL row-level security policies, not just application code                                  | Application-level enforcement can be bypassed by a bug or direct DB access. Database-level enforcement cannot. |
| NFR-17 | Audit log records: entity_type, entity_id, event name, actor_type, actor_id, previous state JSONB, new state JSONB, IP address, timestamp | Minimum required to reconstruct what happened, when, and who caused it                                         |

### 7.4 Reliability

| ID     | Requirement                                                    | Why                                                                                                                                                                |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-18 | Webhook events processed asynchronously via RabbitMQ           | Paystack expects 200 OK within 5 seconds. Synchronous processing (DB write + email + Paystack verify) risks timeout, causing Paystack to retry and double-process. |
| NFR-19 | Article delivery emails dispatched via separate RabbitMQ queue | Decouples publishing from sending. 10,000 subscribers does not block the publish API response.                                                                     |
| NFR-20 | All RabbitMQ queues durable, all messages persistent           | Messages survive a RabbitMQ restart. Without this, a broker restart loses every unprocessed message.                                                               |
| NFR-21 | Messages that fail all retries go to Dead Letter Queue         | Nothing is silently discarded. Failed events are inspectable and replayable.                                                                                       |
| NFR-22 | PostgreSQL daily backups with point-in-time recovery           | Hardware failure must not mean data loss                                                                                                                           |

### 7.5 Observability — Realistic SLOs for Single VPS

| Metric                      | Target                      | Honest Caveat                                                                                                                                                                |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /articles p95 latency   | < 200ms                     | Achievable with Redis cache in front                                                                                                                                         |
| Payment initiation response | < 500ms                     | Excludes Paystack redirect time                                                                                                                                              |
| Webhook processing          | 99% within 30 seconds       | Assumes RabbitMQ consumer is healthy                                                                                                                                         |
| Email delivery success rate | 90% within 10 minutes       | Brevo API availability dependent                                                                                                                                             |
| System uptime               | ~99.0% (~87h downtime/year) | Honest number for single VPS. Hardware failures, kernel reboots, and bad deploys all count as downtime. 99.9% requires two instances plus a load balancer — out of v1 scope. |

---

## 8. Infrastructure & Services

| Component            | Technology                     | Purpose                                                    | Why This Choice                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application Server   | NestJS (Node.js 20)            | Core backend — API, business logic, workers, scheduler     | Deep existing JavaScript knowledge. Strong module system that mirrors domain structure. Same stack as Kwuflow — direct skill transfer.                                                                                                                                  |
| Database             | PostgreSQL 15                  | Primary data store — all persistent entities               | Relational model with strict foreign keys is correct for financial data. Subscriptions reference plans reference users — these relationships must be enforced at DB level. MongoDB does not do this.                                                                    |
| Message Broker       | RabbitMQ 3.12                  | Async webhook processing, async email delivery             | Honest reason: we are learning it. At 100 tx/day, BullMQ on Redis would suffice. RabbitMQ is chosen because understanding a dedicated message broker — durability, acknowledgements, DLQs, exchange routing — is a valuable skill found in production systems at scale. |
| Cache / Rate Limiter | Redis 7                        | Sessions, idempotency keys, rate limiting, article cache   | Already required for sessions. Since it is running, using it for caching and rate limiting costs nothing extra.                                                                                                                                                         |
| Payment Gateway      | Paystack                       | Payment processing, subscription billing, refunds          | Built for the Nigerian market. Supports NGN natively, local bank transfers, USSD. Stripe does not support Nigerian businesses collecting payments. Clean API and good documentation.                                                                                    |
| Email Provider       | Brevo (SMTP)                   | Transactional emails — receipts, refunds, article delivery | Already familiar from Go auth system project. Free tier covers learning scale. SMTP integration is simpler than proprietary SDKs.                                                                                                                                       |
| OAuth Providers      | Google, GitHub                 | Authentication for users and admins                        | Covers the vast majority of users. No passwords stored. Immediate revocation via session deletion.                                                                                                                                                                      |
| Metrics              | Prometheus                     | Collects numeric metrics every 15 seconds                  | Industry standard. Open source. Pairs natively with Grafana.                                                                                                                                                                                                            |
| Dashboard            | Grafana                        | Visualises Prometheus metrics                              | Industry standard. Free. Connects to Prometheus in minutes.                                                                                                                                                                                                             |
| Alerts               | Alertmanager                   | Routes alerts when metrics exceed thresholds               | Works natively with Prometheus. Sends to email or Slack.                                                                                                                                                                                                                |
| Reverse Proxy        | Nginx                          | Terminates SSL, routes traffic to NestJS                   | Handles HTTPS so our app does not have to. Standard production pattern.                                                                                                                                                                                                 |
| Containerisation     | Docker + Docker Compose        | Runs all services consistently                             | One command starts everything. Same environment on dev machine and VPS — eliminates works-on-my-machine problems.                                                                                                                                                       |
| VPS Hosting          | Hetzner CX21 (2 vCPU, 4GB RAM) | Runs all Docker containers                                 | ~€6/month. Adequate for our scale. Hetzner has excellent uptime and value for money.                                                                                                                                                                                    |

---

## 9. Honest Scale Analysis

This section exists because design documents often lie about scale. This one will not.

### 9.1 What This Stack Actually Handles

```
Hardware: Hetzner CX21 — 2 vCPU, 4GB RAM, NVMe SSD

Approximate capacity:
  Concurrent HTTP connections:     ~1,000 (Node.js async handles this well)
  Transactions per day (comfort):  ~10,000
  Transactions per day (burst):    ~50,000 (Redis cache absorbs reads)
  Article delivery subscribers:    ~50,000 per publish (takes ~5-10 min via queue)
  RabbitMQ throughput:             ~10,000 messages/second (massively over-spec)
  Redis operations/second:         ~100,000 (massively over-spec)
  PostgreSQL queries/second:       ~5,000 with proper indexing

Our actual launch load:
  100 tx/day = 0.001 tx/second
  This hardware is 10,000x over-spec for our payment load.
  That is fine — we are building to learn, not to squeeze resources.
```

### 9.2 Where This Architecture Breaks

```
Subscribers > 50,000:
  Publishing one message per subscriber in a loop will spike RabbitMQ.
  Fix: batch into groups of 500, add delay between batches.
  Real fix at scale: dedicated bulk email platform (Mailchimp, SendGrid bulk).

Transactions > 10,000/day sustained:
  PostgreSQL starts to be the bottleneck.
  Fix: read replica for article listing queries.

Concurrent users > 5,000:
  Single VPS CPU becomes the bottleneck.
  Fix: second app instance + load balancer.
  Sessions already in Redis — stateless design makes this seamless.

Redis memory > 3GB:
  Single Redis node starts evicting entries.
  Fix: Redis cluster.
  Very unlikely at our scale — 1M session entries ≈ 100MB.
```

### 9.3 Why We Still Build It This Way

At 100 tx/day, the simplest architecture is NestJS + PostgreSQL + synchronous webhook processing + cron job for subscriptions + direct Brevo calls. That would work fine.

We chose a more complex stack deliberately because:

- **RabbitMQ**: Understanding message queues, durability, DLQs, and consumer patterns is a core backend skill found in every serious production codebase.
- **Redis sessions**: Understanding stateless session management is mandatory for anything that scales horizontally.
- **Prometheus + Grafana**: Observability is what separates junior from senior engineers. Most juniors never instrument a system.
- **Docker Compose**: Containerised environments are the baseline for any modern backend role.

The complexity is justified by learning value, not by scale requirements. Knowing this distinction is itself a senior engineering skill.

---

## 10. Folder Structure

### 10.1 Design Rules

**Rule 1 — Module per domain.** Each business domain owns its controller, service, repository, entity, interface, and DTOs. Cross-domain communication happens only through injected services — never by importing a repository from another module.

**Rule 2 — Common holds NestJS infrastructure.** Guards, interceptors, pipes, filters, decorators live in common/ and are shared across all modules without coupling business domains together.

**Rule 3 — Shared holds infrastructure clients.** Redis, RabbitMQ, Mail, and the database base class live in shared/ and are imported by any module that needs them. Swapping Redis for Memcached means changing one file in shared/redis/ — nothing else changes.

**Rule 4 — Workers are top-level, not inside a module.** Workers do not handle HTTP requests. They consume from RabbitMQ. Putting them inside a module implies they are HTTP handlers. They are background processes — top-level placement makes this immediately obvious.

**Rule 5 — Raw SQL migrations, never ORM auto-sync.** TypeORM’s synchronize: true can drop columns if you rename a field. Raw SQL migrations are explicit, version-controlled, reviewable, and irreversible only when you say so.

### 10.2 Full Structure

```
vaultpay-api/
│
├── docker/
│   └── postgres/
│       └── init-scripts/
│           └── 01-init-db.sh
│
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
│
├── migrations/
│   ├── 001_create_extensions.sql
│   ├── 002_create_users.sql
│   ├── 003_create_sessions.sql
│   ├── 004_create_plans.sql
│   ├── 005_create_articles.sql
│   ├── 006_create_orders.sql
│   ├── 007_create_subscriptions.sql
│   ├── 008_create_complaints.sql
│   ├── 009_create_webhook_events.sql
│   ├── 010_create_audit_logs.sql
│   ├── 011_create_audit_log_rls.sql
│   └── 012_create_reconciliation_reports.sql
│
└── src/
    ├── main.ts
    ├── app.module.ts
    │
    ├── common/
    │   ├── decorators/
    │   │   ├── public.decorator.ts
    │   │   ├── admin.decorator.ts
    │   │   └── current-user.decorator.ts
    │   ├── guards/
    │   │   ├── session.guard.ts
    │   │   ├── admin.guard.ts
    │   │   └── oauth-state.guard.ts
    │   ├── interceptors/
    │   │   ├── response-transform.interceptor.ts
    │   │   ├── logger.interceptor.ts
    │   │   └── rate-limit.interceptor.ts
    │   ├── filters/
    │   │   └── all-exceptions.filter.ts
    │   ├── pipes/
    │   │   └── zod-validation.pipe.ts
    │   ├── interfaces/
    │   │   └── api-response.interface.ts
    │   └── utils/
    │       ├── helpers.ts
    │       ├── money.ts
    │       └── idempotency.ts
    │
    ├── config/
    │   └── index.ts
    │
    ├── shared/
    │   ├── database/
    │   │   ├── database.module.ts
    │   │   └── base.repository.ts
    │   ├── redis/
    │   │   ├── redis.module.ts
    │   │   └── redis.service.ts
    │   ├── rabbitmq/
    │   │   ├── rabbitmq.module.ts
    │   │   └── rabbitmq.service.ts
    │   └── mail/
    │       ├── mail.module.ts
    │       └── mail.service.ts
    │
    ├── workers/
    │   ├── workers.module.ts
    │   ├── webhook.worker.ts
    │   └── mail.worker.ts
    │
    └── modules/
        ├── auth/
        │   ├── auth.module.ts
        │   ├── auth.interface.ts
        │   ├── controllers/
        │   │   └── auth.controller.ts
        │   └── services/
        │       └── auth.service.ts
        │
        ├── users/
        │   ├── users.module.ts
        │   ├── users.interface.ts
        │   ├── controllers/
        │   │   └── users.controller.ts
        │   ├── entities/
        │   │   └── user.entity.ts
        │   ├── repositories/
        │   │   └── users.repository.ts
        │   └── services/
        │       └── users.service.ts
        │
        ├── articles/
        │   ├── articles.module.ts
        │   ├── articles.interface.ts
        │   ├── controllers/
        │   │   └── articles.controller.ts
        │   ├── dto/
        │   │   ├── create-article.dto.ts
        │   │   ├── update-article.dto.ts
        │   │   └── article-response.dto.ts
        │   ├── entities/
        │   │   └── article.entity.ts
        │   ├── repositories/
        │   │   └── articles.repository.ts
        │   └── services/
        │       └── articles.service.ts
        │
        ├── plans/
        │   ├── plans.module.ts
        │   ├── plans.interface.ts
        │   ├── controllers/
        │   │   └── plans.controller.ts
        │   ├── dto/
        │   │   ├── create-plan.dto.ts
        │   │   ├── update-plan.dto.ts
        │   │   └── plan-response.dto.ts
        │   ├── entities/
        │   │   └── plan.entity.ts
        │   ├── repositories/
        │   │   └── plans.repository.ts
        │   └── services/
        │       └── plans.service.ts
        │
        ├── orders/
        │   ├── orders.module.ts
        │   ├── orders.interface.ts
        │   ├── controllers/
        │   │   └── orders.controller.ts
        │   ├── dto/
        │   │   ├── create-order.dto.ts
        │   │   └── order-response.dto.ts
        │   ├── entities/
        │   │   └── order.entity.ts
        │   ├── repositories/
        │   │   └── orders.repository.ts
        │   └── services/
        │       └── orders.service.ts
        │
        ├── payments/
        │   ├── payments.module.ts
        │   ├── payments.interface.ts
        │   ├── providers/
        │   │   ├── base/
        │   │   │   └── base.payment.provider.ts
        │   │   └── paystack/
        │   │       └── paystack.provider.ts
        │   ├── dto/
        │   │   └── refund-response.dto.ts
        │   └── services/
        │       ├── payments.service.ts
        │       └── refunds.service.ts
        │
        ├── subscriptions/
        │   ├── subscriptions.module.ts
        │   ├── subscriptions.interface.ts
        │   ├── controllers/
        │   │   └── subscriptions.controller.ts
        │   ├── dto/
        │   │   ├── create-subscription.dto.ts
        │   │   └── subscription-response.dto.ts
        │   ├── entities/
        │   │   └── subscription.entity.ts
        │   ├── repositories/
        │   │   └── subscriptions.repository.ts
        │   └── services/
        │       ├── subscriptions.service.ts
        │       └── scheduler.service.ts
        │
        ├── webhooks/
        │   ├── webhooks.module.ts
        │   ├── controllers/
        │   │   └── webhooks.controller.ts
        │   ├── dto/
        │   │   └── paystack-event.dto.ts
        │   ├── entities/
        │   │   └── webhook-event.entity.ts
        │   ├── repositories/
        │   │   └── webhook-events.repository.ts
        │   └── services/
        │       └── webhooks.service.ts
        │
        ├── complaints/
        │   ├── complaints.module.ts
        │   ├── complaints.interface.ts
        │   ├── controllers/
        │   │   └── complaints.controller.ts
        │   ├── dto/
        │   │   ├── create-complaint.dto.ts
        │   │   └── complaint-response.dto.ts
        │   ├── entities/
        │   │   └── complaint.entity.ts
        │   ├── repositories/
        │   │   └── complaints.repository.ts
        │   └── services/
        │       └── complaints.service.ts
        │
        ├── audit-logs/
        │   ├── audit-logs.module.ts
        │   ├── entities/
        │   │   └── audit-log.entity.ts
        │   ├── repositories/
        │   │   └── audit-logs.repository.ts
        │   └── services/
        │       └── audit-logs.service.ts
        │
        └── admin/
            ├── admin.module.ts
            └── controllers/
                ├── admin-articles.controller.ts
                ├── admin-plans.controller.ts
                ├── admin-orders.controller.ts
                ├── admin-subscriptions.controller.ts
                ├── admin-complaints.controller.ts
                └── admin-audit-logs.controller.ts
```

---

## 11. DTOs & Validation

### 11.1 What is a DTO and Why Does It Exist?

A DTO (Data Transfer Object) defines the exact shape of data crossing an API boundary. Without DTOs, your controller receives `body: any` — it could be anything. An attacker could send missing fields, negative amounts, or extra fields to probe your system.

With a DTO and Zod validation pipe, the controller receives clean, typed, validated data — or the request is rejected with a 400 error before your business logic runs.

```tsx
// Without DTO — dangerous
async createOrder(@Body() body: any) {
  // body.amount could be a string, negative, or missing
}

// With DTO — safe
async createOrder(@Body(ZodValidationPipe) body: CreateOrderDto) {
  // body is guaranteed: article_id (UUID), email (valid), currency ('NGN'|'USD')
  // anything else was rejected before this line
}
```

### 11.2 Why Zod Over class-validator

Kwuflow uses Zod. We follow the same pattern.

| Concern        | class-validator                                      | Zod                                                                                   |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Type safety    | Decorators only — types not inferred from validation | Schema IS the type — one definition gives both runtime validation and TypeScript type |
| Error messages | Generic                                              | Precise and customisable per field                                                    |
| Composability  | Limited                                              | Schemas compose — reuse sub-schemas                                                   |

### 11.3 DTO Convention

Every DTO file exports exactly two things:

```tsx
import { z } from 'zod';

// 1. Zod schema — used by the validation pipe at runtime
export const CreateOrderSchema = z.object({
  article_id: z.string().uuid({ message: 'article_id must be a valid UUID' }),
  email: z.string().email({ message: 'A valid email is required' }),
  currency: z.enum(['NGN', 'USD'], { message: 'Currency must be NGN or USD' }),
});

// 2. TypeScript type inferred from schema — used in service method signatures
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
// Result: { article_id: string; email: string; currency: 'NGN' | 'USD' }
```

The schema and type are always in sync — you cannot have a type that diverges from runtime validation.

### 11.4 All Request DTOs

**POST /orders — CreateOrderDto**

```tsx
{
  article_id: string; // UUID
  email: string; // valid email
  currency: 'NGN' | 'USD';
}
```

**POST /subscriptions — CreateSubscriptionDto**

```tsx
{
  plan_id: string; // UUID — user identity comes from session cookie, not body
}
```

**POST /complaints — CreateComplaintDto**

```tsx
{
  order_id?: string          // UUID — for one-time purchase complaints
  subscription_id?: string   // UUID — for subscription complaints
  title: string              // 5–255 characters
  message: string            // 20+ characters
  // Schema validation: exactly one of order_id or subscription_id must be present
}
```

**POST /admin/articles — CreateArticleDto**

```tsx
{
  title: string              // 3–500 characters
  content: string            // HTML, 100+ characters
  cover_image_url?: string   // optional, valid URL
  is_free: boolean
  price?: number             // required if is_free = false, positive integer (kobo/cents)
  currency?: 'NGN' | 'USD'  // required if is_free = false
}
```

**PATCH /admin/articles/:id — UpdateArticleDto**

```tsx
{
  title?: string
  content?: string
  cover_image_url?: string
  is_free?: boolean
  price?: number
  currency?: 'NGN' | 'USD'
  is_published?: boolean
}
```

**POST /admin/plans — CreatePlanDto**

```tsx
{
  name: string                              // 3–100 characters
  description?: string
  amount: number                            // positive integer, kobo/cents
  currency: 'NGN' | 'USD'
  interval: 'weekly' | 'monthly' | 'yearly'
}
```

**POST /admin/complaints/:id/resolve — ResolveComplaintDto**

```tsx
{
  action: 'approve' | 'reject';
  resolution: string; // 10+ characters — written decision
}
```

### 11.5 Standard Response Envelope

Every response wrapped by response-transform.interceptor.ts:

```tsx
// Success
{
  success: true,
  data: T,
  message: string,    // e.g. "Order created successfully"
  timestamp: string   // ISO 8601 UTC
}

// Error
{
  success: false,
  error: {
    code: string,     // e.g. "ORDER_NOT_FOUND", "INVALID_HMAC_SIGNATURE"
    message: string,
    details?: any     // validation errors, field-level messages
  },
  timestamp: string
}
```

### 11.6 Key Response Shapes

**OrderResponseDto**

```tsx
{
  id: string;
  email: string;
  article_id: string | null;
  plan_id: string | null;
  amount: number; // raw integer kobo/cents
  amount_display: string; // "₦2,000.00" — formatted for display
  currency: string;
  status: string;
  paystack_reference: string;
  created_at: string;
}
```

**SubscriptionResponseDto**

```tsx
{
  id: string;
  plan: {
    (id, name, amount, amount_display, currency, interval);
  }
  status: string;
  current_period_start: string;
  current_period_end: string;
  retry_count: number;
  cancelled_at: string | null;
  suspended_at: string | null;
}
```

**ArticleFullDto** (for buyers and active subscribers)

```tsx
{
  (id, title, content, cover_image_url, is_free, price, currency, published_at);
}
```

**ArticlePreviewDto** (for non-buyers)

```tsx
{
  id, title,
  content: string,        // first 200 characters only
  cover_image_url, is_free, price, price_display, currency,
  requires_purchase: true // literal true — always present
}
```

---

## 12. Database Schema

### 12.1 Design Decisions

**All IDs are UUID.** Integer IDs are sequential — an attacker knowing order ID 1500 can infer 1499 and 1501 exist and probe them. UUID is random — no information leaks.

**All money as integers.** ₦2,000 stored as 200000 kobo. Always. No rounding errors possible.

**All timestamps as TIMESTAMPTZ.** Always timezone-aware. Always stored as UTC.

**Raw SQL migrations.** Never synchronize: true in production. Explicit SQL is version-controlled and reviewable.

**Indexes on all filtered or sorted columns.** Without an index, PostgreSQL scans every row. An index lets it jump directly to matches. The performance difference at scale is orders of magnitude.

### 12.2 Tables

### users

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  full_name   VARCHAR(255),
  avatar_url  VARCHAR(500),
  provider    VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_id)
  -- Same person logging in with Google twice gets the same user row
);
```

### sessions

```sql
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  ip_address    INET,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
  -- NULL until logout or suspension
  -- This table is for AUDIT only. Auth lookups go to Redis.
  -- Redis = microseconds. PostgreSQL = milliseconds. Every request uses this path.
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
```

### plans

```sql
CREATE TABLE plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  amount      BIGINT NOT NULL,
  currency    VARCHAR(10) NOT NULL,
  interval    VARCHAR(50) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### articles

```sql
CREATE TABLE articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(500) NOT NULL,
  content         TEXT NOT NULL,
  cover_image_url VARCHAR(500),
  is_free         BOOLEAN NOT NULL DEFAULT false,
  price           BIGINT,
  currency        VARCHAR(10),
  is_published    BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_paid_article_has_price
    CHECK (is_free = true OR (price IS NOT NULL AND currency IS NOT NULL))
  -- DB enforces: a paid article must have a price. Application cannot create a paid article without one.
);

CREATE INDEX idx_articles_is_published ON articles(is_published);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
```

### orders

```sql
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) NOT NULL,
  user_id             UUID REFERENCES users(id),
  article_id          UUID REFERENCES articles(id),
  plan_id             UUID REFERENCES plans(id),
  amount              BIGINT NOT NULL,
  currency            VARCHAR(10) NOT NULL,
  status              VARCHAR(50) NOT NULL DEFAULT 'pending',
  paystack_reference  VARCHAR(255) UNIQUE,
  idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
  failure_reason      TEXT,
  refunded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_order_has_subject
    CHECK (article_id IS NOT NULL OR plan_id IS NOT NULL)
  -- Every order is for something. Orphan orders (neither set) rejected by DB.
);

-- status: pending | processing | success | failed | refund_initiated | refunded

CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_paystack_reference ON orders(paystack_reference);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

### subscriptions

```sql
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  plan_id               UUID NOT NULL REFERENCES plans(id),
  status                VARCHAR(50) NOT NULL DEFAULT 'initiated',
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  cancelled_at          TIMESTAMPTZ,
  suspended_at          TIMESTAMPTZ,
  paystack_sub_code     VARCHAR(255),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, plan_id)
);

-- status: initiated | active | past_due | suspended | cancelled

CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_current_period_end ON subscriptions(current_period_end);
-- ^ Critical: scheduler queries "active subs where period_end <= now()" every hour.
-- Without this index: full table scan every hour.
-- With this index: instant lookup.
```

### complaints

```sql
CREATE TABLE complaints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  order_id        UUID REFERENCES orders(id),
  subscription_id UUID REFERENCES subscriptions(id),
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'open',
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_complaint_has_one_subject
    CHECK (
      (order_id IS NOT NULL AND subscription_id IS NULL) OR
      (order_id IS NULL AND subscription_id IS NOT NULL)
    )
  -- A complaint is about exactly one thing: an order OR a subscription.
  -- The DB rejects any row that violates this — we do not rely on the application to remember.
);

-- status: open | under_review | resolved | rejected

CREATE INDEX idx_complaints_user_id ON complaints(user_id);
CREATE INDEX idx_complaints_status ON complaints(status);
```

### webhook_events

```sql
CREATE TABLE webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     VARCHAR(255) NOT NULL UNIQUE,
  event_type   VARCHAR(255) NOT NULL,
  payload      JSONB NOT NULL,
  processed    BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Why store raw payloads?
-- If the webhook worker processes an event incorrectly due to a bug in our code,
-- we can fix the bug and replay the raw payload without waiting for Paystack to resend.
-- Complete immutable record of everything Paystack ever told us.

CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id             BIGSERIAL PRIMARY KEY,
  entity_type    VARCHAR(100) NOT NULL,
  entity_id      UUID NOT NULL,
  event          VARCHAR(255) NOT NULL,
  actor_type     VARCHAR(50) NOT NULL,
  actor_id       UUID,
  previous_state JSONB,
  new_state      JSONB,
  ip_address     INET,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Why BIGSERIAL not UUID?
-- Audit logs are always queried in time order. Sequential integers are faster
-- for range scans and ORDER BY than random UUIDs. The ID is never exposed
-- in a URL (admin-only), so enumeration is not a concern.

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
```

### audit_logs — Row Level Security (011_create_audit_log_rls.sql)

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_no_update ON audit_logs
  FOR UPDATE USING (false);

CREATE POLICY audit_no_delete ON audit_logs
  FOR DELETE USING (false);

-- Why database-level enforcement instead of application-level?
-- Application code can have bugs. A developer can accidentally write a query that
-- updates an audit row. A migration script could truncate the table.
-- Row-level security is enforced by PostgreSQL itself — not bypassable from the
-- application layer. The database is the last line of defense for data integrity.
```

### reconciliation_reports

```sql
CREATE TABLE reconciliation_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  total_checked INTEGER NOT NULL,
  mismatches    INTEGER NOT NULL,
  resolved      INTEGER NOT NULL,
  report_data   JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 13. API Contract

**Base URL:** /api/v1

**Auth:** Session cookie vaultpay_session — HTTP-only, Secure, SameSite=Lax

**Standard response envelope:** All responses wrapped in { success, data, message, timestamp } or { success: false, error: { code, message, details } }

### 13.1 Auth

| Method | Endpoint              | Auth    | Description                                        |
| ------ | --------------------- | ------- | -------------------------------------------------- |
| GET    | /auth/google          | Public  | Generate state, store in Redis, redirect to Google |
| GET    | /auth/google/callback | Public  | Verify state, exchange code, create session        |
| GET    | /auth/github          | Public  | Generate state, store in Redis, redirect to GitHub |
| GET    | /auth/github/callback | Public  | Verify state, exchange code, create session        |
| POST   | /auth/logout          | Session | Delete session from Redis, update sessions table   |
| GET    | /auth/me              | Session | Return current user info                           |

### 13.2 Articles

| Method | Endpoint      | Auth     | Description                                |
| ------ | ------------- | -------- | ------------------------------------------ |
| GET    | /articles     | Public   | Paginated list of published articles       |
| GET    | /articles/:id | Public\* | Full content if authorised, preview if not |

**GET /articles query params:**

```
?cursor=<uuid>   pagination cursor
&limit=20        default 20, max 50
&free=true       filter free articles only
```

**GET /articles/:id access logic:**

```
is_free = true                              → full content, everyone
is_free = false + active subscriber         → full content
is_free = false + purchased this article    → full content
is_free = false + none of above            → preview + requires_purchase: true
```

### 13.3 Plans

| Method | Endpoint   | Auth   | Description           |
| ------ | ---------- | ------ | --------------------- |
| GET    | /plans     | Public | List all active plans |
| GET    | /plans/:id | Public | Get single plan       |

### 13.4 Orders

| Method | Endpoint    | Auth   | Description                        |
| ------ | ----------- | ------ | ---------------------------------- |
| POST   | /orders     | Public | Initiate one-time article purchase |
| GET    | /orders/:id | Public | Get order status                   |

**POST /orders request:**

```json
{ "article_id": "uuid", "email": "customer@example.com", "currency": "NGN" }
```

**POST /orders response:**

```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "authorization_url": "https://checkout.paystack.com/xyz",
    "reference": "uuid-of-order"
  },
  "message": "Payment initiated. Redirecting to payment page."
}
```

### 13.5 Subscriptions

| Method | Endpoint          | Auth    | Description                                  |
| ------ | ----------------- | ------- | -------------------------------------------- |
| POST   | /subscriptions    | Session | Initiate subscription — returns Paystack URL |
| GET    | /subscriptions/me | Session | Current user’s subscription status           |
| DELETE | /subscriptions/me | Session | Cancel current subscription                  |

### 13.6 Complaints

| Method | Endpoint        | Auth    | Description                        |
| ------ | --------------- | ------- | ---------------------------------- |
| POST   | /complaints     | Session | Submit complaint or refund request |
| GET    | /complaints/me  | Session | List user’s complaints             |
| GET    | /complaints/:id | Session | Get complaint status               |

### 13.7 Users

| Method | Endpoint          | Auth    | Description                |
| ------ | ----------------- | ------- | -------------------------- |
| GET    | /users/me         | Session | Get current user profile   |
| GET    | /users/me/library | Session | Get all purchased articles |

### 13.8 Webhooks

| Method | Endpoint           | Auth           | Description                                 |
| ------ | ------------------ | -------------- | ------------------------------------------- |
| POST   | /webhooks/paystack | HMAC signature | Receives Paystack event — must use raw body |

**Critical implementation note:**
NestJS parses request body as JSON by default. HMAC verification requires the raw bytes exactly as Paystack sent them. If you compute HMAC on parsed-and-re-serialised body, the signature will not match. Solution: rawBody: true in NestJS bootstrap options. Access req.rawBody for HMAC verification.

**Paystack events handled:**

| Event                  | Trigger                              | Action                                  |
| ---------------------- | ------------------------------------ | --------------------------------------- |
| charge.success         | Card charged successfully            | Mark order SUCCESS, deliver article     |
| charge.failed          | Card charge failed                   | Mark order FAILED, notify customer      |
| subscription.create    | Paystack subscription object created | Link paystack_sub_code to our record    |
| subscription.disable   | Paystack subscription cancelled      | Mark our subscription CANCELLED         |
| invoice.payment_failed | Recurring charge failed              | Increment retry_count, move to PAST_DUE |
| refund.processed       | Refund completed by Paystack         | Mark order REFUNDED, notify customer    |

### 13.9 Admin Routes

All routes require: valid session + role = admin. Enforced by AdminGuard.

**Admin — Articles**

| Method | Endpoint                      | Description                                      |
| ------ | ----------------------------- | ------------------------------------------------ |
| GET    | /admin/articles               | List all articles (draft and published)          |
| POST   | /admin/articles               | Create article                                   |
| GET    | /admin/articles/:id           | Get article full content                         |
| PATCH  | /admin/articles/:id           | Update article fields                            |
| POST   | /admin/articles/:id/publish   | Publish — triggers email delivery to subscribers |
| POST   | /admin/articles/:id/unpublish | Unpublish                                        |
| DELETE | /admin/articles/:id           | Soft delete                                      |

**Admin — Plans**

| Method | Endpoint         | Description     |
| ------ | ---------------- | --------------- |
| GET    | /admin/plans     | List all plans  |
| POST   | /admin/plans     | Create plan     |
| PATCH  | /admin/plans/:id | Update plan     |
| DELETE | /admin/plans/:id | Deactivate plan |

**Admin — Orders**

| Method | Endpoint                 | Description                                          |
| ------ | ------------------------ | ---------------------------------------------------- |
| GET    | /admin/orders            | List orders with filters (status, email, date range) |
| GET    | /admin/orders/:id        | Order details                                        |
| POST   | /admin/orders/:id/refund | Force refund                                         |

**Admin — Subscriptions**

| Method | Endpoint                            | Description                       |
| ------ | ----------------------------------- | --------------------------------- |
| GET    | /admin/subscriptions                | List all subscriptions            |
| GET    | /admin/subscriptions/:id            | Subscription details              |
| POST   | /admin/subscriptions/:id/cancel     | Cancel subscription               |
| POST   | /admin/subscriptions/:id/reactivate | Reactivate suspended subscription |

**Admin — Complaints**

| Method | Endpoint                      | Description                         |
| ------ | ----------------------------- | ----------------------------------- |
| GET    | /admin/complaints             | List complaints with status filter  |
| GET    | /admin/complaints/:id         | Complaint details                   |
| POST   | /admin/complaints/:id/resolve | Approve (triggers refund) or reject |

**Admin — Audit Logs**

| Method | Endpoint          | Description                       |
| ------ | ----------------- | --------------------------------- |
| GET    | /admin/audit-logs | Read-only log viewer with filters |

---

## 14. System Flows

### 14.1 One-Time Purchase — Complete Flow

```
1. CLIENT
   POST /api/v1/orders
   Body: { article_id, email, currency }

2. OrdersController:
   ZodValidationPipe validates body shape
   Calls OrdersService.create(dto)

3. OrdersService:
   a. Check Redis: "idem:{hash}" — if exists, return existing order (duplicate)
   b. Verify article exists, is_published = true, is_free = false
   c. Generate idempotency_key = UUID v4
   d. BEGIN PostgreSQL transaction:
      INSERT orders: { email, article_id, amount, currency, status:'pending', idempotency_key }
      COMMIT
   e. Store idempotency_key in Redis TTL=24h
   f. Call PaymentsService.initialize({ email, amount, currency, reference: order.id })

4. PaystackProvider.initializePayment():
   POST https://api.paystack.co/transaction/initialize
   Returns: { authorization_url, reference }

5. Response to client: { order_id, authorization_url, reference }

6. CLIENT redirects browser to authorization_url

7. USER completes payment on Paystack page (our server not involved)

8. PAYSTACK sends webhook:
   POST /api/v1/webhooks/paystack
   Headers: x-paystack-signature: sha512-HMAC
   Body: { event:'charge.success', data:{ reference:order.id, amount, id:'ps_evt_001' } }

9. WebhooksController:
   a. Read raw body for HMAC verification
   b. WebhooksService.verifySignature(rawBody, header) → 403 if invalid
   c. Parse JSON
   d. Check Redis: "webhook:ps_evt_001" → if exists, return 200 OK (duplicate)
   e. Store event_id in Redis TTL=48h
   f. INSERT into webhook_events (processed=false)
   g. Publish to RabbitMQ 'paystack.webhooks'
   h. Return 200 OK to Paystack immediately

10. WebhookWorker (background):
    a. Consume from 'paystack.webhooks'
    b. Find order by paystack_reference
    c. Verify order.amount === data.amount (prevent wrong-amount attacks)
    d. BEGIN transaction: UPDATE orders SET status='processing' COMMIT
    e. AuditLogsService.log: PAYMENT_PROCESSING
    f. Publish to 'mail.delivery': { type:'article_purchase', email, article_id, order_id }
    g. BEGIN transaction: UPDATE orders SET status='success' COMMIT
    h. AuditLogsService.log: PAYMENT_SUCCESS
    i. UPDATE webhook_events SET processed=true
    j. ACK to RabbitMQ

11. MailWorker (background):
    a. Consume from 'mail.delivery'
    b. Fetch article content
    c. MailService.sendEmail(email, subject, articleHtml)
    d. Success: ACK
    e. Failure: NACK → retry up to 3x → DLQ

12. PAYSTACK redirects browser to callback_url?reference=order.id
    CLIENT: GET /api/v1/orders/:id → returns status → shows success screen
```

### 14.2 Subscription Initiation Flow

```
1. Authenticated user: POST /subscriptions { plan_id }

2. SubscriptionsService:
   a. Verify user has no existing active/initiated/past_due subscription
   b. Fetch plan — verify is_active = true
   c. BEGIN transaction:
      INSERT subscriptions: { user_id, plan_id, status:'initiated' }
      INSERT orders: { email, plan_id, amount, status:'pending' }
      COMMIT
   d. AuditLogsService.log: SUBSCRIPTION_INITIATED
   e. Call PaystackProvider.initializePayment(...)
   Response: { subscription_id, authorization_url }

3. User pays on Paystack

4. Webhook: charge.success
   WebhookWorker:
   UPDATE orders SET status='success'
   UPDATE subscriptions SET status='active',
     current_period_start=now(),
     current_period_end=now()+interval
   AuditLogsService.log: SUBSCRIPTION_ACTIVATED
   Queue welcome email

5. Webhook: charge.failed
   WebhookWorker:
   UPDATE orders SET status='failed'
   UPDATE subscriptions SET status='cancelled'
   AuditLogsService.log: SUBSCRIPTION_PAYMENT_FAILED
   Queue failure notification email
```

### 14.3 Subscription Renewal Flow (Scheduler)

```
SchedulerService cron: every hour

Query:
  SELECT * FROM subscriptions
  WHERE status = 'active'
  AND current_period_end <= now()

For each due subscription:
  Call PaystackProvider.chargeSubscription(paystack_sub_code)

  IF success:
    UPDATE subscriptions SET
      current_period_start=now(),
      current_period_end=now()+interval,
      retry_count=0
    AuditLogsService.log: SUBSCRIPTION_RENEWED
    Queue receipt email

  IF failure:
    UPDATE subscriptions SET status='past_due', retry_count=retry_count+1
    AuditLogsService.log: SUBSCRIPTION_CHARGE_FAILED
    Queue "payment failed, will retry" email

    IF retry_count >= 3:
      UPDATE subscriptions SET status='suspended', suspended_at=now()
      AuditLogsService.log: SUBSCRIPTION_SUSPENDED
      DEL Redis session for this user  ← access revoked immediately
      Queue "subscription suspended" email
```

### 14.4 Automatic Refund Flow

```
WebhookWorker: charge.success received
      ↓
Fulfillment attempt fails (article deleted, DB error, etc.)
      ↓
RefundsService.initiate(order_id, actor='system'):
  BEGIN transaction:
    SELECT status FROM orders WHERE id=order_id FOR UPDATE
    -- FOR UPDATE locks the row — prevents concurrent duplicate refunds
    IF status = 'refunded' OR 'refund_initiated': ROLLBACK — already done
    UPDATE orders SET status='refund_initiated'
  COMMIT
  AuditLogsService.log: REFUND_INITIATED (actor: system)
  PaystackProvider.refund(paystack_reference)
      ↓
Paystack webhook: refund.processed
      ↓
WebhookWorker:
  UPDATE orders SET status='refunded', refunded_at=now()
  AuditLogsService.log: REFUND_COMPLETED
  Queue refund confirmation email
```

### 14.5 Article Publish & Delivery Flow

```
Admin: POST /admin/articles/:id/publish

ArticlesService:
  UPDATE articles SET is_published=true, published_at=now()
  AuditLogsService.log: ARTICLE_PUBLISHED

NewslettersService.deliverToSubscribers(article_id):
  SELECT email FROM subscriptions
  JOIN users ON user_id = users.id
  WHERE subscriptions.status = 'active'

  Batch subscribers into groups of 500:
    For each subscriber in batch:
      Publish to 'mail.delivery': { type:'newsletter', email, article_id }
    Wait 100ms before next batch
    -- Prevents RabbitMQ queue spike when subscriber count is high

MailWorker processes each message:
  Fetch article content
  Send email via Brevo
  Success: ACK
  Failure after 3 retries: → DLQ
```

### 14.6 Reconciliation Flow

```
ReconciliationService cron: daily at 02:00

period_start = 48 hours ago
period_end = now()

Call Paystack API: GET /transaction?from=period_start&to=period_end&status=success

For each Paystack confirmed transaction:
  Find order WHERE paystack_reference = transaction.reference

  NOT FOUND:
    AuditLogsService.log: RECONCILIATION_MISMATCH — missing order
    Alert admin via email

  FOUND but status != 'success':
    AuditLogsService.log: RECONCILIATION_MISMATCH — wrong status
    Attempt fulfillment as if webhook just arrived
    Log resolution

INSERT reconciliation_reports: { run_at, period, total_checked, mismatches, resolved, report_data }
```

---

## 15. Message Queue Design

### 15.1 Why RabbitMQ and Not BullMQ

BullMQ (built on Redis, which we already have) would be sufficient at 100 tx/day. We chose RabbitMQ deliberately for learning. Key things RabbitMQ teaches that BullMQ does not:

- **AMQP protocol** — the standard message protocol in enterprise systems
- **Exchange routing** — messages go to exchanges, routed to queues by rules
- **Manual ACK/NACK** — explicit control over message lifecycle
- **Independent service** — RabbitMQ runs completely separately from your app; this separation is architecturally important to understand

You chose to learn the right tool at the cost of some added complexity. That is a legitimate engineering decision when the goal is skill development.

### 15.2 Queue Configuration

| Queue                 | Producer                       | Consumer         | Purpose                                 |
| --------------------- | ------------------------------ | ---------------- | --------------------------------------- |
| paystack.webhooks     | WebhooksService                | WebhookWorker    | Async Paystack event processing         |
| paystack.webhooks.dlq | RabbitMQ auto                  | Admin inspection | Failed webhook events after all retries |
| mail.delivery         | WebhookWorker, ArticlesService | MailWorker       | All outbound email delivery             |
| mail.delivery.dlq     | RabbitMQ auto                  | Admin inspection | Failed emails after all retries         |

### 15.3 Durability Configuration

```jsx
// Queue: durable survives broker restart
await channel.assertQueue('paystack.webhooks', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'paystack.dlx',
    'x-message-ttl': 86400000, // 24h — messages expire if never processed
    'x-max-retries': 3,
  },
});

// Message: persistent survives broker restart
await channel.publish(
  'paystack.ex',
  'webhook',
  Buffer.from(JSON.stringify(payload)),
  {
    persistent: true,
    contentType: 'application/json',
  },
);
```

### 15.4 Consumer ACK Pattern

```jsx
channel.consume(
  'paystack.webhooks',
  async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await webhookProcessor.process(payload);
      channel.ack(msg); // success: RabbitMQ removes message
    } catch (error) {
      const retries = msg.properties.headers['x-death']?.[0]?.count ?? 0;
      if (retries >= 3) {
        channel.ack(msg); // exhausted: ACK removes from main queue, DLQ already has it
      } else {
        channel.nack(msg, false, false); // fail: let DLX handle requeue
      }
    }
  },
  { noAck: false },
); // critical: manual acknowledgement mode
```

---

## 16. Subscription State Machine

### 16.1 States

| State         | Meaning                                        | User Access                    | Email Delivery |
| ------------- | ---------------------------------------------- | ------------------------------ | -------------- |
| **INITIATED** | User subscribed, initial payment pending       | No — not yet paid              | No             |
| **ACTIVE**    | Initial payment confirmed, billing on schedule | Full access                    | Yes            |
| **PAST_DUE**  | Renewal failed, in 3-day retry window          | Access maintained during retry | Yes            |
| **SUSPENDED** | All 3 retries failed                           | No access                      | No             |
| **CANCELLED** | Cancelled by user or admin                     | Until period end, then no      | No             |

### 16.2 State Transitions

```
[user subscribes + payment initiated]
              ↓
          INITIATED
         ↙          ↘
[payment           [payment
 confirmed]          failed]
    ↓                   ↓
  ACTIVE            CANCELLED
    │
    │ [renewal charge fails]
    ↓
  PAST_DUE ──[retry succeeds]──▶ ACTIVE
    │
    │ [retry_count = 3, all failed]
    ↓
  SUSPENDED ──[admin reactivates]──▶ ACTIVE
    │
    │ [user or admin cancels]
    ↓
  CANCELLED  (terminal)
```

**Why INITIATED state?**
A subscription created in ACTIVE state before payment confirms means a user gets access to all paid content for free if the webhook is delayed or lost. INITIATED makes payment the gate to access. This is the difference between a working business model and a free content service. This was the most significant bug in the v2 design — fixed here.

---

## 17. Transaction State Machine

### 17.1 States

| State                | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| **PENDING**          | Order created. Awaiting Paystack webhook.                          |
| **PROCESSING**       | charge.success received. Fulfillment executing.                    |
| **SUCCESS**          | Fulfillment complete. Article delivered or subscription activated. |
| **FAILED**           | Payment declined or fulfillment errored.                           |
| **REFUND_INITIATED** | Refund sent to Paystack. Awaiting refund.processed webhook.        |
| **REFUNDED**         | Refund confirmed. Customer reimbursed. Terminal.                   |

### 17.2 Transitions

```
[POST /orders]
      ↓
   PENDING
      ↓ [charge.success]
  PROCESSING
      ↙          ↘
SUCCESS          FAILED
    │
    │ [refund triggered]
    ↓
REFUND_INITIATED
    │
    │ [refund.processed]
    ↓
 REFUNDED (terminal)
```

A FAILED order is permanent. The customer initiates a new order to retry — never automatic retry on a failed order. The original failed order record stays for audit purposes.

---

## 18. Caching Strategy

| Data                                 | Cache              | TTL            | Invalidation                               |
| ------------------------------------ | ------------------ | -------------- | ------------------------------------------ |
| Article listing GET /articles        | Redis read-through | 60 seconds     | Article published, unpublished, or updated |
| Single free article                  | Redis read-through | 5 minutes      | Article content updated                    |
| Subscription status for access check | Redis              | 5 minutes      | Subscription status changes                |
| Idempotency keys                     | Redis              | 24 hours       | Automatic TTL expiry                       |
| OAuth state parameter                | Redis              | 10 minutes     | Consumed on callback, or TTL expiry        |
| Rate limit counters                  | Redis              | Sliding window | Automatic                                  |
| Session data                         | Redis              | 7 days         | Explicit delete on logout or suspension    |

**Cache fallback:** If Redis is unavailable, application reads from PostgreSQL directly. Caching is skipped. Rate limiting temporarily disabled. System degrades gracefully — slower, but functional.

---

## 19. Monitoring & Observability

### 19.1 Metrics (Prometheus format at /metrics)

**HTTP metrics:**

```
http_requests_total{method, route, status_code}
http_request_duration_seconds{method, route}
```

**Business metrics:**

```
payment_initiations_total{currency, status}
webhook_events_received_total{event_type}
webhook_events_processed_total{event_type, status}
email_sent_total{type, status}
refunds_initiated_total{trigger}
subscription_charges_total{status}
subscription_state_changes_total{from_state, to_state}
```

**Infrastructure metrics:**

```
rabbitmq_queue_depth{queue}
redis_connected
db_query_duration_seconds{query_type}
db_pool_active_connections
```

### 19.2 Structured Logging

Every log line is JSON with a correlation_id that threads through every log line for a single request — tie a payment initiation to its webhook to its email delivery in one search.

```json
{
  "level": "info",
  "timestamp": "2025-05-01T10:00:00.000Z",
  "service": "orders",
  "message": "Order created",
  "correlation_id": "req_a1b2c3",
  "order_id": "uuid",
  "amount": 200000,
  "currency": "NGN",
  "duration_ms": 45
}
```

### 19.3 Alerting Rules

| Alert                  | Condition                            | Severity |
| ---------------------- | ------------------------------------ | -------- |
| HighErrorRate          | 5xx rate > 1% over 5 min             | Critical |
| WebhookQueueLag        | paystack.webhooks depth > 100        | Warning  |
| EmailFailureRate       | Email failure > 5% over 15 min       | Warning  |
| PaymentSuccessRateLow  | Success rate < 85% over 30 min       | Critical |
| DLQMessagesPresent     | Any message in any DLQ               | Warning  |
| ReconciliationMismatch | Reconciliation report mismatches > 0 | Warning  |

### 19.4 Realistic SLOs

| Metric                 | Target                | Why This Number                                                      |
| ---------------------- | --------------------- | -------------------------------------------------------------------- |
| GET /articles p95      | < 200ms               | Redis cache — achievable                                             |
| Payment initiation p95 | < 500ms               | DB write + Paystack API call                                         |
| Webhook processing     | 99% within 30 seconds | RabbitMQ + healthy worker                                            |
| Email delivery success | 90% within 10 minutes | Brevo dependent                                                      |
| System uptime          | ~99.0%                | Honest for single VPS. 99.9% requires two instances + load balancer. |

---

## 20. Failure Handling & Blast Radius

| Component Fails | Impact                              | Mitigation                                                                                                               | Recovery                             |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| NestJS App      | All HTTP requests fail              | Docker restart policy: always. Restarts in seconds.                                                                      | Auto                                 |
| PostgreSQL      | Reads and writes fail               | Connection retry with exponential backoff. Free articles from Redis cache (stale up to 5 min).                           | DB restart                           |
| Redis           | Sessions, cache, rate limiting fail | Read fallback to PostgreSQL. Skip cache writes. Sessions fallback to sessions table. Rate limiting temporarily disabled. | Redis restart (fast)                 |
| RabbitMQ        | Queue processing stops              | Webhook handler stores event in webhook_events table (processed=false). On RabbitMQ recovery, worker drains DB backlog.  | RabbitMQ restart, then worker drains |
| Paystack        | Payments fail                       | Graceful error shown to users. No auto-retry. Alert on success rate drop.                                                | Paystack incident resolves           |
| Brevo           | Emails not sent                     | Mail queue holds messages in RabbitMQ. When Brevo recovers, backlog processes automatically.                             | Brevo incident resolves              |
| Bad deploy      | Regression                          | Docker images tagged by version. Rollback: docker compose up with previous image tag.                                    | One command, ~30 seconds             |

**RabbitMQ + DB fallback explained:**
When RabbitMQ is down, the webhook handler catches the publish error, stores the raw event in webhook_events with processed=false, and returns 200 OK to Paystack anyway. On RabbitMQ recovery, a startup hook or a 5-minute polling job finds unprocessed rows and publishes them. Nothing is lost.

---

## 21. Scaling Plan

Each step is triggered by a specific observable metric, not a calendar or gut feeling.

**Step 0 — Current: Single VPS, Docker Compose**
Comfortable capacity: ~10,000 tx/day, ~50,000 email subscribers.

**Step 1 — Separate Database**
Trigger: PostgreSQL CPU consistently > 60% OR p95 query > 100ms in Grafana.
Change: Move PostgreSQL to dedicated VPS or managed instance (Neon, Supabase).
Code change: None. Update DATABASE_URL environment variable.

**Step 2 — Second App Instance + Load Balancer**
Trigger: App CPU consistently > 70% OR p95 HTTP latency > 500ms.
Change: Add Nginx load balancer. Add second NestJS container.
Code change: None. Sessions already in Redis — any instance handles any request.

**Step 3 — PostgreSQL Read Replica**
Trigger: Cache hit ratio < 70% AND DB reads > 80% of total DB load.
Change: Route SELECT queries for article listing to read replica. Writes to primary.
Code change: Minimal. Two DB connection pools in database.module.ts.

**Step 4 — Separate Worker Processes**
Trigger: RabbitMQ queue lag consistently > 5 minutes.
Change: Extract workers/ into a separate NestJS deployment. Scale workers independently.
Code change: Moderate. New main.worker.ts entry point. Same codebase.

**Step 5 — Article Delivery Batching**
Trigger: Subscriber count > 50,000 AND RabbitMQ spikes during article publish.
Change: Batch subscribers into groups of 500 with delay between batches.
Code change: Minor. Already designed with batching in Section 14.5.

---

## 22. High-Level System Architecture

### 22.1 Runtime View

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Hetzner VPS (Ubuntu 22.04)                      │
│                                                                      │
│  ┌───────────┐   ┌──────────────────────────────────────────────┐   │
│  │   Nginx   │   │               Docker Network                 │   │
│  │  :443     │   │                                              │   │
│  │  SSL/TLS  │──▶│  ┌────────────────────────────────────────┐ │   │
│  │  Reverse  │   │  │         NestJS App  :3000              │ │   │
│  │  Proxy    │   │  │  ┌──────────────┐  ┌────────────────┐  │ │   │
│  └───────────┘   │  │  │   HTTP API   │  │   Background   │  │ │   │
│                  │  │  │   Modules    │  │   Workers      │  │ │   │
│                  │  │  │              │  │ WebhookWorker  │  │ │   │
│                  │  │  │              │  │ MailWorker     │  │ │   │
│                  │  │  │              │  │ Scheduler      │  │ │   │
│                  │  │  └──────────────┘  └────────────────┘  │ │   │
│                  │  └──────────────┬──────────────┬───────────┘ │   │
│                  │                 │              │              │   │
│                  │   ┌─────────────▼──┐  ┌────────▼──────────┐  │   │
│                  │   │  PostgreSQL    │  │      Redis        │  │   │
│                  │   │  :5432         │  │      :6379        │  │   │
│                  │   │                │  │                   │  │   │
│                  │   │  users         │  │  sessions         │  │   │
│                  │   │  articles      │  │  idempotency keys │  │   │
│                  │   │  orders        │  │  article cache    │  │   │
│                  │   │  subscriptions │  │  rate limits      │  │   │
│                  │   │  webhook_events│  │  oauth state      │  │   │
│                  │   │  audit_logs    │  │                   │  │   │
│                  │   └────────────────┘  └───────────────────┘  │   │
│                  │                                               │   │
│                  │   ┌────────────────┐  ┌─────────────────┐    │   │
│                  │   │   RabbitMQ     │  │   Prometheus    │    │   │
│                  │   │   :5672        │  │   :9090         │    │   │
│                  │   │                │  └────────┬────────┘    │   │
│                  │   │ paystack.      │           │              │   │
│                  │   │  webhooks      │  ┌────────▼────────┐    │   │
│                  │   │ mail.delivery  │  │    Grafana      │    │   │
│                  │   │ *.dlq          │  │    :3001        │    │   │
│                  │   └────────────────┘  └─────────────────┘    │   │
│                  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
          │                              │
          │ HTTPS requests               │ Webhook callbacks
          ▼                              ▼
   ┌─────────────┐              ┌─────────────────┐
   │   Browser   │              │    Paystack     │
   │   Client    │              │    Servers      │
   └─────────────┘              └─────────────────┘
          │                              │
          │ OAuth redirect               │ Email delivery
          ▼                              ▼
   ┌─────────────┐              ┌─────────────────┐
   │  Google /   │              │     Brevo       │
   │  GitHub     │              │  SMTP Service   │
   └─────────────┘              └─────────────────┘
```

### 22.2 Request Flow — One-Time Purchase

```
Browser              Nginx           NestJS App              External
   │                   │                 │                      │
   │─POST /orders─────▶│                 │                      │
   │                   │──forward───────▶│                      │
   │                   │                 │─validate DTO          │
   │                   │                 │─check idempotency     │
   │                   │                 │─write DB (PENDING)    │
   │                   │                 │──────────────────────▶│ Paystack
   │                   │                 │◀────────────────────── auth_url
   │◀─authorization_url─│◀───────────────│                      │
   │                   │                 │                      │
   │──redirect to Paystack───────────────────────────────────▶  │
   │◀──────────────────────────── user pays ──────────────────  │
   │                   │                 │                      │
   │                   │    POST /webhooks/paystack ◀───────────│
   │                   │                 │─verify HMAC           │
   │                   │                 │─check idempotency     │
   │                   │                 │─write webhook_events  │
   │                   │                 │─publish to RabbitMQ   │
   │                   │                 │─200 OK───────────────▶│
   │                   │                 │                      │
   │                   │          [WebhookWorker]               │
   │                   │                 │─consume queue         │
   │                   │                 │─update order SUCCESS  │
   │                   │                 │─publish to mail queue │
   │                   │                 │                      │
   │                   │          [MailWorker]                  │
   │                   │                 │─consume queue────────────▶ Brevo
   │                   │                 │                    email → user
   │                   │                 │                      │
   │─GET /orders/:id──▶│────────────────▶│                      │
   │◀─{status:success}─│◀────────────────│                      │
```

### 22.3 Module Dependency View

```
                           AppModule
                               │
           ┌───────────────────┼─────────────────────┐
           │                   │                     │
      SharedModule        WorkersModule         Feature Modules
   ┌────────┴────────┐   ┌─────┴──────┐       ┌──────┴──────────┐
   │ DatabaseModule  │   │ Webhook    │       │ AuthModule       │
   │ RedisModule     │   │ Worker     │       │ UsersModule      │
   │ RabbitMQModule  │   │            │       │ ArticlesModule   │
   │ MailModule      │   │ Mail       │       │ PlansModule      │
   └─────────────────┘   │ Worker     │       │ OrdersModule     │
                         │            │       │ PaymentsModule   │
                         │ Scheduler  │       │ Subscriptions    │
                         └────────────┘       │ WebhooksModule   │
                                              │ ComplaintsModule │
                                              │ AuditLogsModule  │
                                              │ AdminModule      │
                                              └──────────────────┘

Rules:
  Any Feature Module may import SharedModule and AuditLogsModule.
  Feature Modules communicate via NestJS DI (Dependency Injection).
  Repositories are never imported across module boundaries.
  Workers import SharedModule (RabbitMQ, Mail) and any Feature Service they need.
```

---

## 23. Explicitly Out of Scope (v1)

| Feature                           | Why Excluded                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Split payments / multi-merchant   | Adds escrow, payout, and compliance complexity                                                   |
| Wallet / internal balance         | Different product requiring user balance management                                              |
| Partial refunds                   | Requires fractional amount tracking and proration logic                                          |
| Facebook OAuth                    | Low adoption, high integration overhead                                                          |
| Physical delivery tracking        | No physical products                                                                             |
| Multi-currency beyond NGN and USD | Currency conversion, exchange rate management                                                    |
| Mobile application                | API-first design — mobile can be built on this API later                                         |
| Multi-language support            | No current multilingual user base                                                                |
| Recommendation engine             | Requires usage data that does not yet exist                                                      |
| Affiliate / referral system       | Separate product feature with own data model                                                     |
| Multi-region deployment           | Requires data replication strategy and latency-based routing                                     |
| 2FA / TOTP for admin              | OAuth to Google already provides phishing-resistant auth — adding TOTP on top would be redundant |

---

_Vaultpay Inc. — Engineering Team · v3.0 · ConfidentialBuilt to be understood, not just followed._
