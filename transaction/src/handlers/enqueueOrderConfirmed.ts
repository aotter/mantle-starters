/**
 * enqueueOrderConfirmed — bound to `orders.after_create` lifecycle.
 *
 * Sends `order.confirmed` to ORDER_WORK_QUEUE. The payment-callback
 * consumer also enqueues this inline (it writes the order row direct
 * to D1, bypassing the lifecycle); this handler covers the path
 * where order creation DOES route through the runtime — future
 * staff-side manual entry, MCP create, etc.
 *
 * Idempotent — sending the same `order.confirmed` twice is safe;
 * `orderWorkConsumer` dedups via the order row's
 * `confirmation_emailed_at` marker.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";

export interface EnqueueOrderConfirmedEnv {
  readonly ORDER_WORK_QUEUE: Queue;
}

export interface EnqueueOrderConfirmedInput {
  /** Lifecycle hook passes the created entry's data. */
  readonly data?: { orderNumber?: string };
  /** Explicit override when invoked directly (e.g. MCP). */
  readonly orderId?: string;
}

export interface EnqueueOrderConfirmedOutput {
  readonly enqueued: true;
  readonly orderId: string;
}

export function buildEnqueueOrderConfirmed(
  env: EnqueueOrderConfirmedEnv,
): AnyHandler {
  return defineHandler<EnqueueOrderConfirmedInput, EnqueueOrderConfirmedOutput>(
    async (input) => {
      const orderId = input.orderId ?? input.data?.orderNumber;
      if (!orderId) {
        throw new Error("enqueueOrderConfirmed: missing orderId / data.orderNumber");
      }
      await env.ORDER_WORK_QUEUE.send({ type: "order.confirmed", orderId });
      return { enqueued: true, orderId };
    },
  );
}
