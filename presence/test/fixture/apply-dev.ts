/**
 * Dev fixture entrypoint for the presence starter.
 * Run via `pnpm fixture` before `pnpm dev`.
 *
 * Seeds home + about pages so `/` and `/<locale>/pages/about` render
 * on first install. No staff row — `ensureBootstrapOwner` promotes
 * the operator on their first GitHub OAuth login.
 */
import { applyFixture } from "./apply-shared.js";

async function main(): Promise<void> {
  await applyFixture({
    artefactPrefix: "dev",
  });

  process.stdout.write("\nNext:\n");
  process.stdout.write("  pnpm dev\n");
  process.stdout.write("  open http://localhost:8787\n");
}

main();
