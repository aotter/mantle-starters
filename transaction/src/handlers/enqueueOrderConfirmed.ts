/**
 * enqueueOrderConfirmed — bound to `orders.after_create` lifecycle.
 *
 * Sends an `order.confirmed` message to ORDER_WORK_QUEUE. In PR 2
 * the payment-callback consumer does this inline (bypassing the
 * lifecycle hook because the order INSERT goes direct-to-D1 to avoid
 * needing a service-principal auth context). This handler exists so
 * that when consumers DO route through the runtime's CreateDraft
 * path (future provisioning flow / staff-side manual order entry /
 * etc.), the lifecycle hook still kicks off downstream work.
 *
 * Idempotent — sending the same `order.confirmed` twice is safe;
 * `orderWorkConsumer` dedups its work via the order row's
 * `confirmation_emailed_at` marker.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";

export interface EnqueueOrderConfirmedEnv {
  readonly ORDER_WORK_QUEUE: Queue;
}

export interface EnqueueOrderConfirmedInput {
  /** Lifecycle hook passes the just-created entry's data. The
   *  orders Schema declares `orderNumber` as required, so it's safe
   *  to assume non-null here. */
  readonly data?: { orderNumber?: string };
  /** Optional explicit override (handy if invoked from MCP). */
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
        throw new Error(
          "enqueueOrderConfirmed: missing orderId / data.orderNumber",
        );
      }
      await env.ORDER_WORK_QUEUE.send({
        type: "order.confirmed",
        orderId,
      });
      return { enqueued: true, orderId };
    },
  );
}
