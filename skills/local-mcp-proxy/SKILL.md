---
name: local mcp proxy
description: Connect a locally running mantle starter dev server (`pnpm dev`) to an MCP-capable agent client — Claude Code, Cowork, Claude Desktop, or Codex. Picks the right endpoint (`/mcp` vs `/mcp/staff`), writes the smallest client config that works, and verifies the connection. Hides HTTP-vs-stdio transport details from the user.
when_to_invoke: |
  The user has a scaffolded mantle project running locally and says something like
  "connect this site to my agent", "let me test the MCP locally", "把本地 MCP 接給
  Claude / Cowork / Codex", or asks how to call staff MCP tools against `pnpm dev`.
  Not for production MCP — deployed sites hand out their `/mcp/staff` URL directly.
---

# local mcp proxy

You're connecting a **locally running** mantle starter to the user's agent
client. Every starter mounts two MCP surfaces during `pnpm dev`:

| Endpoint | Auth | For |
|---|---|---|
| `http://localhost:8787/mcp` | OAuth (bearer) | public surface — read tools only, what an anonymous integration sees |
| `http://localhost:8787/mcp/staff` | OAuth (bearer + staff role) | authoring surface — `create_draft_*`, `update_draft_*`, `query_view_*`, plus every Procedure bound with `source.kind: mcp, surface: staff` |

Both speak **streamable HTTP MCP** behind `@cloudflare/workers-oauth-provider`:
RFC 8414 discovery (`/.well-known/oauth-authorization-server`), dynamic client
registration (`/oauth/register`), PKCE authorization-code flow. Any client that
can do remote-MCP OAuth connects natively; clients that only speak stdio go
through an `mcp-remote` proxy. Either way the user never handles tokens by hand.

**Always use `localhost`, never `127.0.0.1`.** The OAuth issuer is derived from
the request origin — mixing hostnames splits the cookie/token universe and the
flow dies with redirect-mismatch errors.

## Preflight

Don't write any client config until all three pass:

```bash
# 1. Worker is up (root returns the headless JSON sitemap or archetype HTML)
curl -s --max-time 5 http://localhost:8787/ | head -c 200

# 2. MCP surface is mounted and OAuth-gated: expect 401 + WWW-Authenticate
curl -s -D - -o /dev/null -X POST http://localhost:8787/mcp/staff \
  -H 'content-type: application/json' -d '{}' | grep -i 'www-authenticate\|^HTTP'

# 3. OAuth discovery answers
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:8787/.well-known/oauth-authorization-server
```

- Root returns `auth_not_configured` → `.dev.vars` is missing
  `BETTER_AUTH_SECRET`; fix that first (the starter's README / install skill
  covers it).
- Connection refused → `pnpm dev` isn't running. Start it; don't proceed on a
  dead port.
- Port differs → the starter honors `WRANGLER_DEV_PORT`; substitute the real
  port everywhere below.

## Choosing the endpoint

Ask what the user wants to test, don't guess:

- **Reading public content / "what would an anonymous agent see"** → `/mcp`.
- **Authoring, staff procedures, anything that writes** → `/mcp/staff`.
  The OAuth dance ends at the site's sign-in page, so the user needs a way to
  sign in locally **and** that user must hold a staff role:
  - First sign-in matching `bootstrapOwner` (`ADMIN_EMAIL` / `ADMIN_GITHUB_LOGIN`
    in `.dev.vars`) is auto-promoted to owner.
  - Magic-link in local dev uses `ConsoleEmailSender` — **the sign-in link is
    printed in the `pnpm dev` terminal**, not sent as real email. Tell the user
    this before they go looking for an email.

## Client config matrix

### Claude Code — native HTTP, no proxy

```bash
claude mcp add --transport http --scope project mantle-local-staff \
  http://localhost:8787/mcp/staff
```

Writes `.mcp.json` at the project root (committed, team-shared). Use
`--scope local` instead for a personal-only connection — that's also the
low-pollution choice for quick experiments. Then inside a Claude Code session
run `/mcp` and pick the server to complete the browser OAuth sign-in.

### Cowork — same `.mcp.json`, zero extra steps

Cowork sessions opened in the project folder read the project-scope
`.mcp.json` that Claude Code writes. Equivalent hand-written file:

```json
{
  "mcpServers": {
    "mantle-local-staff": {
      "type": "http",
      "url": "http://localhost:8787/mcp/staff"
    }
  }
}
```

New sessions pick it up on start; the OAuth prompt appears in-app on first
tool use. (`pnpm dev` must be running on the same machine as Cowork.)

### Claude Desktop — stdio via `mcp-remote`

Claude Desktop's local servers are stdio-only, so bridge with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). In
`claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mantle-local-staff": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/mcp/staff", "--transport", "http-only"]
    }
  }
}
```

Restart Claude Desktop; `mcp-remote` opens the browser for the OAuth sign-in
on first connect. Tokens cache in `~/.mcp-auth` — `rm -rf ~/.mcp-auth` is the
clean-slate reset (also the fix when a stale local client registration breaks
after the dev DB is wiped).

### Codex — stdio via `mcp-remote`

In `~/.codex/config.toml`:

```toml
[mcp_servers.mantle-local-staff]
command = "npx"
args = ["-y", "mcp-remote", "http://localhost:8787/mcp/staff", "--transport", "http-only"]
```

Same browser OAuth + `~/.mcp-auth` cache behavior as Claude Desktop.

## Verify

Minimal proof, before telling the user it works:

1. **Pre-auth HTTP check** (no client involved): the preflight 401 with a
   `WWW-Authenticate: Bearer … resource_metadata=…` header proves the MCP
   surface and OAuth metadata are wired.
2. **Client-side capability check**: after the OAuth sign-in, list tools from
   the client (`/mcp` in Claude Code; tool picker in Desktop/Cowork). Expect
   the generic catalog (`list_entries`, `get_entry`, `query_view_*`,
   `create_draft_*` per collection) plus any starter-declared MCP procedures.
3. Call one **read** tool (e.g. a `query_view_*`) end-to-end. Don't smoke-test
   with a write.

If `tools/list` works but a staff tool returns `AUTH_DENIED`, the signed-in
user has no staff role — re-check the `bootstrapOwner` match in `.dev.vars`
(the promotion only fires for the *first* user ever created; a wrong-email
first sign-in permanently misses it — wipe the local D1 state under
`.wrangler/` and sign in again).

## Hygiene

- Prefer **project-scope** config (`.mcp.json`) over global client config for
  anything tied to one repo; it travels with the repo and uninstalls by
  deleting one file.
- `mcp-remote` is a dev-loop bridge, not a deploy artifact: nothing here
  belongs in `wrangler.toml`, `mantleConfig.ts`, or production secrets.
- The local OAuth grants live in the dev D1/KV state — wiping `.wrangler/`
  invalidates them; expect a re-auth (and possibly the `~/.mcp-auth` reset
  above) afterwards.
