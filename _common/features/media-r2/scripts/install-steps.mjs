// Provision steps contributed by the media-r2 feature overlay (#250).
//
// IMPORTANT: first-run install MUST stay R2-free (no Cloudflare billing
// prompt, no bucket create). These steps therefore do not call any CF
// API — they print pointer guidance only. The actual R2 provisioning
// is the separate, explicitly opt-in script at
// `scripts/media-r2-provision.mjs`, which the operator runs when
// they're ready to open billing on R2.

export const installSteps = [
  {
    id: "media-r2-pointer",
    phase: "post-scaffold",
    label: "media-r2 — opt-in R2 hosting available",
    /** @type {(ctx: { print(line: string): void }) => Promise<void>} */
    async run(ctx) {
      ctx.print(
        "media-r2 feature installed. R2 hosting is NOT auto-provisioned (first-run stays R2-free).",
      );
      ctx.print(
        "When you're ready to open Cloudflare billing on R2, run:",
      );
      ctx.print("  pnpm media-r2:provision");
      ctx.print(
        "See `scripts/media-r2-provision.mjs` + this feature's README for the manual dashboard steps (custom domain / public read URL / CORS).",
      );
    },
  },
];
