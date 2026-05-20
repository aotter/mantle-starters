import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // sharp's libvips encode can take several seconds on CI cold-start —
    // bump default 5 s timeout so the avif encode doesn't trip.
    testTimeout: 15_000,
  },
});
