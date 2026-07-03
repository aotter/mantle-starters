import { createWorkerFetch } from "./worker/app.js";
import {
  authSetupComplete,
  setupIncompleteResponse,
  shouldBlockWhenAuthIncomplete,
} from "./worker/auth.js";
import type { Env } from "./mantle/config.js";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!authSetupComplete(env) && shouldBlockWhenAuthIncomplete(url.pathname)) {
      return setupIncompleteResponse();
    }
    return createWorkerFetch(env)(req, env, ctx);
  },
};
