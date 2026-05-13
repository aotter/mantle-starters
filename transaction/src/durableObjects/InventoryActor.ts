/**
 * InventoryActor — single DurableObject per tenant. Two distinct
 * responsibilities, deliberately co-located in one DO to minimize
 * total count (transaction starter is sized for ≤100 orders/day; one
 * DO covers the contention):
 *
 *   1. **Find-and-modify lock for once-and-only-once processing.**
 *      `tryAcquire(workId)` returns `{acquired: true}` only on the
 *      first call per workId — same atomicity guarantee MongoDB's
 *      `findOneAndModify({state: pending}, {$set: completed})` gives,
 *      free here because DO storage is single-threaded per instance.
 *      `markCompleted(workId)` flips the state. Sweeper resets stale
 *      `pending` entries after PENDING_LOCK_TTL_MS so a crashed
 *      consumer doesn't strand work — side effects MUST be idempotent
 *      for the rare sweeper-then-retry path.
 *
 *   2. **Inventory authority.** Reserve / commit / release per
 *      product slug; periodic snapshot to D1 inventory_snapshots for
 *      staff Views. The DO holds the canonical state; D1 row is a
 *      query-friendly mirror.
 *
 * Storage keys (in `state.storage`):
 *
 *   lock:<workId>             { state: "pending" | "completed", at: ms }
 *   product:<slug>            { available: number, reserved: number }
 *   reservation:<id>          { items: [{slug, qty}], orderId, expiresAt }
 *
 * Method calls arrive via JSON-RPC over `stub.fetch(...)`. Single-
 * threaded per instance → no internal locks needed inside method
 * bodies.
 */

export interface AcquireResult {
  readonly acquired: boolean;
  /** When acquired: false because already-completed. */
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

interface LockEntry {
  readonly state: "pending" | "completed";
  readonly at: number;
}

interface ProductInventory {
  readonly available: number;
  readonly reserved: number;
}

interface ReservationEntry {
  readonly items: ReadonlyArray<{ productSlug: string; qty: number }>;
  readonly orderId: string;
  readonly expiresAt: number;
}

const PENDING_LOCK_TTL_MS = 10 * 60 * 1000; // 10 min
const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 min
const COMPLETED_LOCK_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h

export class InventoryActor implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: unknown,
  ) {}

  // ── lock surface (find-and-modify pattern) ───────────────────────

  async tryAcquire(workId: string): Promise<AcquireResult> {
    const key = `lock:${workId}`;
    const existing = await this.state.storage.get<LockEntry>(key);
    if (existing) {
      return {
        acquired: false,
        ...(existing.state === "completed" ? { alreadyCompleted: true } : {}),
      };
    }
    const now = Date.now();
    await this.state.storage.put(key, { state: "pending", at: now });
    return { acquired: true };
  }

  async markCompleted(workId: string): Promise<void> {
    const key = `lock:${workId}`;
    const now = Date.now();
    await this.state.storage.put(key, { state: "completed", at: now });
  }

  /**
   * Sweeper — invoked from a queue tick (PR 3 wires the cron path).
   * Walks `lock:*` keys; resets stale `pending` (older than TTL) by
   * deleting the lock so a queue redelivery can re-acquire and the
   * idempotent work side effects run again. Also garbage-collects
   * `completed` locks past retention.
   */
  async sweepStaleLocks(): Promise<{ resetCount: number; gcCount: number }> {
    const now = Date.now();
    const entries = await this.state.storage.list<LockEntry>({
      prefix: "lock:",
    });
    let resetCount = 0;
    let gcCount = 0;
    for (const [key, value] of entries) {
      if (value.state === "pending" && now - value.at > PENDING_LOCK_TTL_MS) {
        await this.state.storage.delete(key);
        resetCount += 1;
      } else if (
        value.state === "completed" &&
        now - value.at > COMPLETED_LOCK_RETENTION_MS
      ) {
        await this.state.storage.delete(key);
        gcCount += 1;
      }
    }
    return { resetCount, gcCount };
  }

  // ── inventory surface ────────────────────────────────────────────

  async reserve(req: ReserveRequest): Promise<ReserveResult | ReserveFailure> {
    // First pass: read all affected products in one shot; check stock.
    const productKeys = req.items.map((i) => `product:${i.productSlug}`);
    const products = await this.state.storage.get<ProductInventory>(productKeys);
    const insufficient: Array<{
      productSlug: string;
      requested: number;
      available: number;
    }> = [];
    for (const item of req.items) {
      const inv = products.get(`product:${item.productSlug}`);
      const available = inv?.available ?? 0;
      if (available < item.qty) {
        insufficient.push({
          productSlug: item.productSlug,
          requested: item.qty,
          available,
        });
      }
    }
    if (insufficient.length > 0) {
      return { ok: false, reason: "insufficient_stock", insufficient };
    }

    // Second pass: decrement available / increment reserved + persist
    // reservation record. Single DO instance → no race; this whole
    // method body is atomic.
    const now = Date.now();
    const reservationId = `r_${now.toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const expiresAt = now + RESERVATION_TTL_MS;
    const updates = new Map<string, ProductInventory>();
    for (const item of req.items) {
      const inv = products.get(`product:${item.productSlug}`)!;
      updates.set(`product:${item.productSlug}`, {
        available: inv.available - item.qty,
        reserved: inv.reserved + item.qty,
      });
    }
    for (const [key, value] of updates) {
      await this.state.storage.put(key, value);
    }
    await this.state.storage.put<ReservationEntry>(`reservation:${reservationId}`, {
      items: req.items,
      orderId: req.orderId,
      expiresAt,
    });

    // Set alarm if no earlier one is scheduled. Auto-release covers
    // the case where checkoutStart succeeds but the customer never
    // completes payment.
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm === null || currentAlarm > expiresAt) {
      await this.state.storage.setAlarm(expiresAt);
    }

    return { ok: true, reservationId, expiresAt };
  }

  async commit(
    reservationId: string,
  ): Promise<{ committed: ReadonlyArray<{ productSlug: string; qty: number }> }> {
    const reservation = await this.state.storage.get<ReservationEntry>(
      `reservation:${reservationId}`,
    );
    if (!reservation) {
      // Idempotent: already committed (or never existed). Return empty
      // — caller should rely on its own dedup (e.g. INSERT OR IGNORE
      // on order row) instead of this method's side effects.
      return { committed: [] };
    }
    const updates = new Map<string, ProductInventory>();
    for (const item of reservation.items) {
      const inv = await this.state.storage.get<ProductInventory>(
        `product:${item.productSlug}`,
      );
      const reserved = inv?.reserved ?? 0;
      const available = inv?.available ?? 0;
      updates.set(`product:${item.productSlug}`, {
        available,
        reserved: Math.max(0, reserved - item.qty),
      });
    }
    for (const [key, value] of updates) {
      await this.state.storage.put(key, value);
    }
    await this.state.storage.delete(`reservation:${reservationId}`);
    return { committed: reservation.items.map((i) => ({ ...i })) };
  }

  async release(reservationId: string): Promise<void> {
    const reservation = await this.state.storage.get<ReservationEntry>(
      `reservation:${reservationId}`,
    );
    if (!reservation) return; // already released (idempotent)
    for (const item of reservation.items) {
      const inv = await this.state.storage.get<ProductInventory>(
        `product:${item.productSlug}`,
      );
      const reserved = inv?.reserved ?? 0;
      const available = inv?.available ?? 0;
      await this.state.storage.put<ProductInventory>(
        `product:${item.productSlug}`,
        {
          available: available + item.qty,
          reserved: Math.max(0, reserved - item.qty),
        },
      );
    }
    await this.state.storage.delete(`reservation:${reservationId}`);
  }

  async snapshot(
    productSlug: string,
  ): Promise<{ available: number; reserved: number }> {
    const inv = await this.state.storage.get<ProductInventory>(
      `product:${productSlug}`,
    );
    return { available: inv?.available ?? 0, reserved: inv?.reserved ?? 0 };
  }

  async restock(productSlug: string, addQty: number): Promise<void> {
    const inv = await this.state.storage.get<ProductInventory>(
      `product:${productSlug}`,
    );
    await this.state.storage.put<ProductInventory>(`product:${productSlug}`, {
      available: (inv?.available ?? 0) + addQty,
      reserved: inv?.reserved ?? 0,
    });
  }

  // ── DO infrastructure ────────────────────────────────────────────

  /**
   * JSON-RPC envelope over fetch. Stubs call us via:
   *   stub.fetch("https://do/<method>", { method: "POST", body: JSON.stringify(args) })
   * We respond with { ok: true, result } | { ok: false, error }.
   * Single-threaded per-instance — no concurrency concerns inside.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = url.pathname.replace(/^\/+/, "");
    try {
      const argsJson = await request.text();
      const args = argsJson.length > 0 ? JSON.parse(argsJson) : undefined;
      const result = await this.dispatch(method, args);
      return Response.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }

  private async dispatch(method: string, args: unknown): Promise<unknown> {
    switch (method) {
      case "tryAcquire":
        return this.tryAcquire((args as { workId: string }).workId);
      case "markCompleted":
        await this.markCompleted((args as { workId: string }).workId);
        return null;
      case "sweepStaleLocks":
        return this.sweepStaleLocks();
      case "reserve":
        return this.reserve(args as ReserveRequest);
      case "commit":
        return this.commit((args as { reservationId: string }).reservationId);
      case "release":
        await this.release((args as { reservationId: string }).reservationId);
        return null;
      case "snapshot":
        return this.snapshot((args as { productSlug: string }).productSlug);
      case "restock":
        await this.restock(
          (args as { productSlug: string; addQty: number }).productSlug,
          (args as { productSlug: string; addQty: number }).addQty,
        );
        return null;
      default:
        throw new Error(`InventoryActor: unknown method '${method}'`);
    }
  }

  /**
   * Alarm fires when the earliest pending reservation expires. We
   * walk all reservations, release the expired ones, and reschedule
   * the alarm to the next-earliest deadline (if any).
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const entries = await this.state.storage.list<ReservationEntry>({
      prefix: "reservation:",
    });
    let nextDeadline: number | null = null;
    for (const [key, reservation] of entries) {
      if (reservation.expiresAt <= now) {
        const reservationId = key.slice("reservation:".length);
        await this.release(reservationId);
      } else if (nextDeadline === null || reservation.expiresAt < nextDeadline) {
        nextDeadline = reservation.expiresAt;
      }
    }
    if (nextDeadline !== null) {
      await this.state.storage.setAlarm(nextDeadline);
    }
  }
}

// ── Typed RPC client (used by handlers + queue consumers) ────────────

export interface InventoryActorClient {
  tryAcquire(workId: string): Promise<AcquireResult>;
  markCompleted(workId: string): Promise<void>;
  sweepStaleLocks(): Promise<{ resetCount: number; gcCount: number }>;
  reserve(req: ReserveRequest): Promise<ReserveResult | ReserveFailure>;
  commit(reservationId: string): Promise<{
    committed: ReadonlyArray<{ productSlug: string; qty: number }>;
  }>;
  release(reservationId: string): Promise<void>;
  snapshot(productSlug: string): Promise<{ available: number; reserved: number }>;
  restock(productSlug: string, addQty: number): Promise<void>;
}

/**
 * Resolve the singleton InventoryActor and return its typed RPC
 * client. The transaction starter uses one DO per tenant (see file
 * docblock); this helper centralizes the `idFromName("singleton")`
 * acquisition so callers stay one-liner.
 */
export function getInventoryActor(env: {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
}): InventoryActorClient {
  return inventoryActorClient(
    env.INVENTORY_ACTOR.get(env.INVENTORY_ACTOR.idFromName("singleton")),
  );
}

/**
 * Wrap a DO stub in the typed RPC client. All handlers + consumers
 * use this; direct stub.fetch() calls go through here.
 */
export function inventoryActorClient(stub: DurableObjectStub): InventoryActorClient {
  const call = async <T>(method: string, args?: unknown): Promise<T> => {
    const res = await stub.fetch(`https://do/${method}`, {
      method: "POST",
      body: args === undefined ? "" : JSON.stringify(args),
    });
    const body = (await res.json()) as { ok: boolean; result?: T; error?: string };
    if (!body.ok) throw new Error(body.error ?? "InventoryActor RPC failed");
    return body.result as T;
  };
  return {
    tryAcquire: (workId) => call<AcquireResult>("tryAcquire", { workId }),
    markCompleted: (workId) => call("markCompleted", { workId }),
    sweepStaleLocks: () => call("sweepStaleLocks"),
    reserve: (req) => call<ReserveResult | ReserveFailure>("reserve", req),
    commit: (reservationId) => call("commit", { reservationId }),
    release: (reservationId) => call("release", { reservationId }),
    snapshot: (productSlug) => call("snapshot", { productSlug }),
    restock: (productSlug, addQty) => call("restock", { productSlug, addQty }),
  };
}
