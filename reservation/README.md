# `mantle-starters/reservation` — ROADMAP

> **Status: planned, v0.2.** Only this README and [`SKILL.md`](./SKILL.md)
> exist today. The install Skill's refuse path
> (see `SKILL.md`) routes users to `intake` as a holding pattern until
> this starter lands. This document is the **architecture contract**
> the implementation will follow — the design is fixed even if the
> code isn't yet.

`reservation` archetype starter for mantle v0.2 — public site that
**takes bookings against time-bounded resources**. Meeting rooms,
appointment slots, equipment rentals, classes with capacity. Designed
to align with the [`transaction`](../transaction/) starter's
DO + Queue shape so anyone who's read transaction can read reservation
without rebuilding their mental model.

For a structured-form intake without slot atomicity (lead capture,
RSVPs, RFQs), use [`intake/`](../intake/).

## Architectural overview (planned)

| Piece | Where (planned) | Purpose |
|---|---|---|
| `ReservationActor` DO | `src/durableObjects/ReservationActor.ts` | Single DO per tenant. Holds find-and-modify locks for once-and-only-once payment-callback processing + atomic overlap-check / reserve / confirm / release per resource. |
| `payment-callback-queue` | `wrangler.toml` + `src/handlers/paymentConsumer.ts` | Workers Queue at `max_concurrency: 1`. Payment provider's webhook lands here; consumer confirms the reservation under the DO lock. Optional — only mounted when the install Skill wires a payment provider. |
| `reservation-work-queue` | same | Workers Queue for downstream effects: confirmation email, reminder send, calendar invite, no-show flag. |
| `PaymentProvider` interface | `src/payment/provider.ts` | Same three-method contract as transaction — `startCheckout` / `parseCallback` / `verifyReturn`. Same scaffolding template at install. |
| Cron sweeper | `wrangler.toml [triggers].crons` | Every 5 min → sweep stale `pending` reservations (10 min TTL) and dispatch reminders for upcoming confirmed reservations. |

## Scale contract (planned)

This starter is sized for **≤200 reservations/day** across all resources
combined — most single-location services (clinics, salons, coaches,
co-working desks) live well below this. Single ReservationActor +
`max_concurrency: 1` queues serialize all work; above that scale,
contention bottlenecks the reserve path and customers see queueing
latency on hot slots.

Mantle's install interview asks "roughly how many bookings per day?"
and routes >200 to `reservation-pro` (roadmap — sharded DOs per
resource, multi-region read replicas).

## Concurrency hazards + protection (planned)

The same four hazards from [`transaction`](../transaction/#design-choice--limits)
apply, with reservation-shaped variants:

| Hazard | Reservation variant | Protected by |
|---|---|---|
| **R1 — webhook retry** | Payment provider re-delivers a callback for the same reservation; two consumers try to mark it confirmed. | `payment-callback-queue` (consumer serialization) + `ReservationActor.tryAcquire(workId)` (storage-level idempotency). |
| **R2 — synchronous race** | Two customers click "book 2pm" on the same resource within ms; both pass an availability check, both create reservations, double-book. | `ReservationActor.reserve()` — DO is single-threaded per instance, so concurrent `stub.fetch()` calls queue up inside the DO. The overlap-check + write happen in the same single-threaded method. |
| **R3 — multi-resource bundle** | A booking that needs room A + projector B atomically: either both reserved or neither (no half-bundle). | `reserve()` checks + writes every requested resource in one DO method (multi-key atomic by construction). |
| **R4 — TTL release** | A pending reservation never completes; held slot needs to release. | DO Alarm (`expiresAt`) fires per-reservation; sweeper runs as a backstop. |

## Overlap semantics (planned)

Reservations use **half-open intervals**: `[start, end)`. A reservation
1:00–2:00 does NOT conflict with another 2:00–3:00 — back-to-back
bookings are allowed. This matches the dominant booking-system
convention (calendars, meeting rooms, fitness classes).

If your domain needs **closed intervals** (medical procedures with
buffer, equipment with cool-down), inject the buffer at the
schema layer (`end = clinicalEnd + cooldownMinutes`), not at the
overlap check. Keeping the half-open invariant at the storage layer
makes the SQL / DO logic uniform across resource types.

## Design choice + limits (planned)

**Why one DO per tenant, not one DO per resource?** Sharding by resource
(`stub = RESERVATION_ACTOR.idFromName(resourceSlug)`) would scale
linearly with resource count but breaks R3 — multi-resource bundles
can't be reserved atomically across DO instances. At ≤200 reservations/day,
one DO covers the contention; the multi-resource bundle is the dominant
constraint. Same trade-off as transaction's SKU-vs-tenant decision.

**Why queues when DO already serializes?** Same reasons as transaction:

1. Native webhook-retry semantics (`max_retries / retry_delay / dead_letter_queue`)
   for payment callbacks.
2. Buffer between fast webhook delivery and slow DO work so the
   payment provider's webhook 200 OK fast.

`reservation` ships without a payment provider by default — most
bookings are free-to-confirm (clinic visit, RSVP). The payment path
mounts only when the install Skill detects a paid-booking shape and
scaffolds a `PaymentProvider`.

**What this starter will NOT scale to:**

- **More than ~200 reserve req/s sustained.** DO storage operations
  cap at roughly that per single instance.
- **Hot single resource at flash-sale scale.** "The 2pm yoga class
  everyone wants" still bottlenecks through one DO. Mitigate with
  app-level queueing (waitlist) rather than infrastructure changes.
- **Multi-tenant within one Worker.** Each tenant = its own deploy.

**Graduation path** (when to leave this starter):

| Symptom | Fix |
|---|---|
| Reserve latency rises on hot slots | Shard `ReservationActor` per resource (`idFromName(resourceSlug)`); accept that multi-resource bundles need a coordinator pattern (saga / Outbox), or run them sequentially with compensating release. |
| Webhook consumer backlog | Raise `max_concurrency` on `payment-callback-queue`; R1 idempotency still holds because DO `tryAcquire` is the serialization point, not the queue. |
| Booking count outgrows D1 IOPS | Move resource / reservation storage to Hyperdrive-backed PostgreSQL (mantle v0.2+); ReservationActor stays as the consistency layer. |
| Need geo-redundancy | Move to `reservation-pro` starter (roadmap) — multi-region DOs + replicated read views. |

## Holding pattern (today)

Until this starter lands, use [`intake`](../intake/) for booking-shaped
input with manual confirmation. The install Skill's
[refuse path](./SKILL.md) walks the user through that decision.
