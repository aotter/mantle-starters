import { Hono } from "hono";
import { renderer } from "../../renderer.js";
import { HomePage } from "../../web/pages/HomePage.js";
import type { Env } from "../../mantle/config.js";

export function createHomeRoutes(env: Env): Hono {
  const app = new Hono();
  app.use("*", renderer);
  app.get("/", (c) => c.render(<HomePage turnstileSiteKey={env.TURNSTILE_SITE_KEY} />));
  return app;
}
