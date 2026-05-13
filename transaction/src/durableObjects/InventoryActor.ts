/**
 * InventoryActor (also acts as ShopGuard) — single DurableObject per
 * tenant. Two distinct responsibilities, deliberately co-located in
 * one DO so we minimize total DO count (transaction starter is sized
 * for ≤100 orders/day; one DO is enough):
 *
 *   1. **Find-and-modify lock for once-and-only-once processing.**
 *      `tryAcquire(workId)` returns `{acquired: true}` only on the
 *      first call per workId — same atomicity guarantee MongoDB's
 *      `findOneAndModify({state: pending}, {$set: completed})` gives,
 *      free here because DO storage is single-threaded per instance.
 *      `markCompleted(workId)` flips the state. Sweeper resets stale
 *      `pending` entries after PENDING_LOCK_TTL_MS.
 *
 *   2. **Inventory authority.** Reserve / commit / release per
 *      product. Single source of truth; snapshotted to D1
 *      `inventory_snapshots` for staff Views.
 *
 * Method calls arrive via JSON-RPC over `stub.fetch(...)` (see fetch
 * impl below). Single-threaded per instance → no internal locks
 * needed.
 *
 * Workers Durable Objects API. Signatures shown; bodies elided.
 */

export interface AcquireResult {
  readonly acquired: boolean;
  /** When acquired: false because already-completed; useful for caller idempotency. */
  readonly alreadyCompleted?: boolean;
}

export interface ReserveRequest {
  readonly orderId: string;
  readonly items: ReadonlyArray<{ productSlug: string; qty: number }>;
}

export interface ReserveResult {
  readonly ok: true;
  readonly reservationId: string;
  readonly expiresAt: number;
}

export interface ReserveFailure {
  readonly ok: false;
  readonly reason: "insufficient_stock";
  readonly insufficient: ReadonlyArray<{
    productSlug: string;
    requested: number;
    available: number;
  }>;
}

/** Sweeper releases reservations + locks idle past this. */
const PENDING_LOCK_TTL_MS = 10 * 60 * 1000;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

export class InventoryActor implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: unknown,
  ) {}

  // --- lock surface (find-and-modify pattern) -----------------------

  /**
   * Try to acquire the lock for `workId`. Atomic by DO single-threading.
   * Returns `{acquired: true}` once per workId; subsequent calls return
   * `{acquired: false}` (with `alreadyCompleted: true` if the work has
   * been confirmed done, false if it's still pending).
   *
   * Caller pattern (queue consumer):
   *
   *   const r = await stub.tryAcquire(event.id);
   *   if (!r.acquired) return;        // dedup hit
   *   try {
   *     await doWork(event);          // idempotent in case sweeper false-positives
   *     await stub.markCompleted(event.id);
   *   } catch (err) {
   *     // queue will retry; sweeper will reclaim lock if we're really stuck
   *     throw err;
   *   }
   */
  async tryAcquire(_workId: string): Promise<AcquireResult> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.tryAcquire", "PR 2"));
  }

  /** Flip `workId` to completed. Idempotent — multiple calls allowed. */
  async markCompleted(_workId: string): Promise<void> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.markCompleted", "PR 2"));
  }

  /**
   * Sweeper entry — called from `alarm()` periodically (every 5min)
   * via Cron Trigger via Queue (see orderConsumer.ts:
   * inventory.reconcile.tick). Walks the `pending` locks; any with
   * `at < now - PENDING_LOCK_TTL_MS` gets reset (delete the key)
   * so the queue's eventual retry can re-acquire and re-do the work.
   * Work side effects must be idempotent — sweeper is a recovery
   * mechanism, not a transaction substitute.
   */
  async sweepStaleLocks(): Promise<{ readonly resetCount: number }> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.sweepStaleLocks", "PR 3"));
  }

  // --- inventory surface ---------------------------------------------

  async reserve(_req: ReserveRequest): Promise<ReserveResult | ReserveFailure> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.reserve", "PR 2"));
  }

  async commit(_reservationId: string): Promise<{
    readonly committed: ReadonlyArray<{ productSlug: string; qty: number }>;
  }> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.commit", "PR 2"));
  }

  async release(_reservationId: string): Promise<void> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.release", "PR 2"));
  }

  async snapshot(
    _productSlug: string,
  ): Promise<{ available: number; reserved: number }> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.snapshot", "PR 3"));
  }

  async restock(_productSlug: string, _addQty: number): Promise<void> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.restock", "PR 3"));
  }

  // --- DO infrastructure --------------------------------------------

  /** JSON-RPC envelope over fetch. */
  async fetch(_request: Request): Promise<Response> {
    throw new Error(stubMessage("InventoryActor.fetch", "PR 2"));
  }

  /**
   * Alarm fires for reservation auto-release. Sweeper for stale locks
   * is invoked from outside via queue message (not alarm) so it can
   * run on a separate schedule.
   */
  async alarm(): Promise<void> {
    void this.state;
    throw new Error(stubMessage("InventoryActor.alarm", "PR 2"));
  }
}

function stubMessage(symbol: string, pr: "PR 2" | "PR 3"): string {
  return (
    `transaction-starter: ${symbol} is a PR 1 scaffold stub; ` +
    `live implementation lands in ${pr}.`
  );
}

void PENDING_LOCK_TTL_MS;
void RESERVATION_TTL_MS;
type DurableObject = {
  fetch(request: Request): Promise<Response>;
  alarm?(): Promise<void>;
};
type DurableObjectState = unknown;
