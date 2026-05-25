/**
 * Shared handler types for the transaction starter.
 *
 * Background — the transaction starter's ref handlers need
 * `runtime.listEntries.execute(...)` to read seeded products / orders
 * from D1. The runtime's stock `HandlerContext` only carries `{ user,
 * staff, env, waitUntil }`; it does NOT expose the runtime ref. PR 2
 * works around this by typing handler ctx as `{ runtime: CmsRuntime }`
 * and casting at the registry boundary; PR 3 (or a follow-up to the
 * runtime itself) should provide a first-class way to reach the
 * runtime from inside a Procedure handler.
 *
 * `defineHandler` centralises the `as unknown as AnyHandler` cast that
 * each factory used to do inline. Authors write `defineHandler(async
 * (input, ctx) => ...)` and the cast lives in exactly one place.
 */
import type { AnyHandler, CmsRuntime } from "@aotter/mantle/runtime";

/**
 * Ctx shape the transaction starter's handlers expect. Note this is
 * a SUPERSET of the runtime's stock `HandlerContext` — the `runtime`
 * field is plugged in by the custom GET-route bridges in `src/index.ts`
 * (and, in a future runtime release, by the dispatcher itself). Tests
 * that call handlers directly pass `{ runtime }` here.
 */
export interface TxHandlerContext {
  readonly runtime: CmsRuntime;
  /** Resolved caller identity. Populated by the SDK's
   *  `mountServerEndpoints` when the HTTP Trigger carries a Better
   *  Auth cookie session (#299 + #175). Null for anonymous requests.
   *  For routes the starter mounts itself (GET pages), the caller
   *  must populate this from `auth.getSession(req)`. */
  readonly user?: { readonly id: string } | null;
  /** Staff-role identity, populated only when the caller has a role
   *  in STAFF_ROLES. Null for non-staff (including signed-in
   *  customers). */
  readonly staff?: { readonly id: string; readonly role: string } | null;
}

/**
 * Typed handler signature for the transaction starter. Authored
 * handler factories return one of these; `defineHandler` widens to
 * `AnyHandler` at the registry boundary.
 */
export type TxHandler<I, O> = (input: I, ctx: TxHandlerContext) => Promise<O>;

/**
 * Adapter from a typed handler to the registry's `AnyHandler`. The
 * cast is structurally safe — `AnyHandler = (input: any, ctx:
 * HandlerContext) => Promise<any>`, and our `TxHandlerContext` is a
 * superset of the runtime's `HandlerContext`. The double cast is just
 * to silence the variance check on the ctx parameter.
 */
export function defineHandler<I, O>(fn: TxHandler<I, O>): AnyHandler {
  return fn as unknown as AnyHandler;
}

/**
 * Inverse adapter — invoke an `AnyHandler` with a transaction-shaped
 * ctx. Used by the custom GET routes in `src/index.ts` (which can't
 * declare GET Triggers in v0.1 and so call the underlying Procedure
 * handler directly). The cast is the same as `defineHandler`'s, just
 * applied at the call site instead of the registry boundary.
 */
export function invokeHandler<I, O>(
  handler: AnyHandler,
  input: I,
  ctx: TxHandlerContext,
): Promise<O> {
  const typed = handler as unknown as TxHandler<I, O>;
  return Promise.resolve(typed(input, ctx));
}

/** True when `err` is a runtime "entry not found" error — either the
 *  message matches the common phrase or the structured diagnostic
 *  code is `ENTRY_NOT_FOUND`. Used by orderId collision-detection in
 *  `checkoutStart.generateOrderId` to distinguish "no such order" (a
 *  fresh id) from a real failure. */
export function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message ?? "";
  if (/not.?found|ENTRY_NOT_FOUND|no entry with id/i.test(message)) return true;
  const diag = (err as { diagnostic?: { code?: string } }).diagnostic;
  return diag?.code === "ENTRY_NOT_FOUND";
}
