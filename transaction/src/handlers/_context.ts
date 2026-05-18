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
