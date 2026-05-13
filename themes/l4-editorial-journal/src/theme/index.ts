import type { ThemeOverride } from "../Theme.js";
import { TOKENS_CSS as ForkedTokens } from "./tokens.js";

/**
 * Install-time theme overlay entrypoint.
 *
 * The overlay deliberately touches only L1 tokens. Removing this theme
 * in a generated project is reversible with:
 *
 *   pnpm theme:reset tokens.ts
 */
const overrides: ThemeOverride = {
  tokens: ForkedTokens,
};

export default overrides;
