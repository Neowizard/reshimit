# Reshimit

Reshimit is a lightweight, real-time collaborative todo-list app. The name is a
deliberate misspelling of the Hebrew *reshima* (רשימה, "list"), meant to read as
"small list"

There are no accounts: every **collection** of lists lives at a random URL (a
*route*), and anyone with the link can view and edit it. Edits sync live across all
open browsers. The UI is right-to-left (Hebrew) by default with an opt-in
left-to-right mode.

## Features

- Multiple named lists per collection.
- Color tags on todos (8 colors, renamable per list) with filtering by *any* or *all* selected colors.
- Complete / uncomplete, reorder to top/bottom, bulk "clear completed" and "complete all".
- Real-time sync across open browsers via Server-Sent Events (SSE).
- Shareable, login-free route URLs; the server keeps 5 rotating backups per collection.
- RTL (Hebrew) by default; routes whose id starts with `LTR` render left-to-right in English.

## Architecture

| Component | Stack | Port | Role |
| --- | --- | --- | --- |
| `backend/` | Flask | 4434 | JSON API; stores each collection on disk, pushes SSE change notifications |
| `frontend/` | Next.js 15 / React 19 | 4433 | The web UI |
| `mcp_server/` | Python (MCP) | 8000 | Token-authed MCP server exposing CRUD tools over the backend (see [MCP server](#mcp-server)) |
| `docker/` | Docker Compose | — | Builds and runs the backend, frontend, and MCP server |

The frontend (and the MCP server) follow a whole-document model: fetch the entire
collection, edit it in memory, then write the whole thing back. The backend
serializes writes per route and notifies connected clients so the UI updates live.

## Data model

A collection (one route) is a JSON array of lists:

```json
[
  {
    "name": "Default",
    "todos": [
      { "text": "Buy milk", "completed": false, "colors": ["red"] }
    ],
    "colorNames": { "red": "אדום", "blue": "כחול" }
  }
]
```

- **route** — alphanumeric id, at most 16 chars (e.g. `A1B2C3D4`); `GET /new` mints 8-char ids.
- **todo.colors** — any subset of: `red`, `pink`, `purple`, `blue`, `teal`, `green`, `yellow`, `white`.
- **colorNames** — optional per-list display names for colors; added lazily by the UI.

## HTTP API (backend)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/new` | Create a collection; returns `{"route": "..."}` |
| `GET` | `/<route>` | Return the collection's lists (creates an empty default if missing) |
| `PUT` | `/<route>` | Replace the whole collection. Requires header `X-Client-ID`; body is the lists array |
| `GET` | `/<route>/updates?client_id=<id>` | SSE stream of change notifications |

## Running

Reshimit runs with Docker Compose, which builds and starts the backend
(port 4434), the frontend (port 4433), and the token-authenticated MCP server
(port 8000):

```bash
cd docker
cp .env.example .env   # then edit .env: set RESHIMIT_PUBLIC_HOST to your host
docker compose up --build
```

Before building, copy `docker/.env.example` to `docker/.env` and set
`RESHIMIT_PUBLIC_HOST` to the public hostname your browser (and clients) reach this
deployment at. Compose uses it for the frontend's backend URL and Caddy's TLS
certificate. `docker/.env` is gitignored, so your real hostname never lands in
version control. Once it's up, open the frontend — it calls `/new` and redirects you
to a fresh collection at `/<route>`.

The backend is a plain Flask app (`backend/`, see `requirements.txt`) and the
frontend a plain Next.js app (`frontend/`), so you can run either directly if you
prefer.

## MCP server

`mcp_server/server.py` is a [Model Context Protocol](https://modelcontextprotocol.io)
server that lets an MCP client (Claude Desktop, …) read and edit
collections through the backend API — so changes show up live in any open browser.
Point it at whichever backend you want to drive via `RESHIMIT_BACKEND_URL`; that
backend does not need to be on the same machine as the client.

It runs as a networked **streamable-HTTP** service and is **token-authenticated**: on
boot it generates a bearer token (printed to the console) and rejects any client
request that doesn't present it. It binds loopback (`127.0.0.1`) by default, so
exposing it to other machines is an explicit opt-in (see below).

### Tools

| Tool | Purpose |
| --- | --- |
| `create_collection` | Create a new collection, returns its route |
| `get_lists` | Read all lists and todos, with indices |
| `add_list` / `rename_list` / `delete_list` | Manage lists |
| `add_todo` / `update_todo` / `toggle_todo` / `delete_todo` | Manage todos |
| `clear_completed` | Drop all completed todos from a list |

Lists are addressed by `list_name` (or `list_index` to disambiguate duplicates);
todos by `todo_index` within a list (see `get_lists`).

### Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `RESHIMIT_BACKEND_URL` | `http://localhost:4434` | Backend base URL |
| `RESHIMIT_ROUTE` | _(unset)_ | Optional default route, so you can omit `route=` on every call |
| `RESHIMIT_MCP_HOST` | `127.0.0.1` | Address to bind. Set to `0.0.0.0` to accept connections from other machines |
| `RESHIMIT_MCP_PORT` | `8000` | Port to listen on |
| `RESHIMIT_MCP_TOKEN` | _(random)_ | Bearer token clients must present. If unset, a fresh one is generated on each boot and printed |
| `RESHIMIT_MCP_AUTH` | `token` | `token` requires the bearer token on every request; `none` disables auth entirely (see [Exposing it to Claude web/mobile](#exposing-it-to-claude-webmobile)) |
| `RESHIMIT_MCP_ALLOWED_HOSTS` | _(localhost only)_ | Hosts accepted in the `Host`/`Origin` headers. Needed when reaching the server under a public name (see note below). `*` = accept any host; or a comma-separated list of `host[:port]` |
| `RESHIMIT_MCP_CORS_ORIGINS` | `*` | CORS origins browsers may call from. Default allows all (the bearer token is the trust boundary). Set to a comma-separated list (e.g. `https://claude.ai`) to restrict |

> **Reaching it under a public hostname?** The MCP SDK enables DNS-rebinding
> protection and, by default, only trusts `localhost`/`127.0.0.1`. A request that
> arrives with any other `Host` header (e.g. a public DNS name) is rejected with
> **`421 Invalid Host header`** — *after* the token check passes, so it looks like a
> connection failure rather than an auth error. Set `RESHIMIT_MCP_ALLOWED_HOSTS=*`
> (the bundled Compose service does this) or list your host(s) explicitly to allow
> them.

### Running the server

It ships as its own service in the Docker Compose stack (a separate Python 3.12
image from the backend), so `docker compose up --build` starts it alongside the
backend and frontend. The compose service binds `0.0.0.0:8000` and points at the
bundled backend; edit its `environment:` block in `docker/docker-compose.yml` to
target a different backend or pin a token. With no `RESHIMIT_MCP_TOKEN` set, a fresh
token is generated on each boot — read it from the logs:

```bash
docker compose logs mcp
```

To run it **standalone** instead (e.g. pointed at a backend on another machine), use
[uv](https://docs.astral.sh/uv/), which installs the dependencies and a pinned Python
3.12 on first launch:

```bash
RESHIMIT_BACKEND_URL=http://your-backend-host:4434 \
  uv run --python 3.12 /absolute/path/to/mcp_server/server.py
```

Either way, on boot it prints the endpoint and the bearer token clients must use:

```
reshimit MCP server — streamable HTTP, token-authenticated
  endpoint : http://127.0.0.1:8000/mcp
  backend  : http://your-backend-host:4434
  token    : <random-token>
  clients must send header:  Authorization: Bearer <token>
```

Run standalone it binds `127.0.0.1` by default (loopback only); set
`RESHIMIT_MCP_HOST=0.0.0.0` to let other machines connect. Pin `RESHIMIT_MCP_TOKEN` so
the token survives restarts instead of changing on every boot.

### Connecting Claude Desktop

Add this to `claude_desktop_config.json`, then fully quit and reopen Claude Desktop:

```json
{
  "mcpServers": {
    "reshimit": {
      "type": "http",
      "url": "http://your-mcp-host:8000/mcp",
      "headers": { "Authorization": "Bearer <token-from-boot>" }
    }
  }
}
```

### Exposing it to Claude web/mobile

Claude Code and Claude Desktop run the MCP client locally and can send a custom
`Authorization` header, so the token transport above works for them. The **Claude
web app and the mobile apps cannot**: they connect from Anthropic's cloud and only
support *authless* or *OAuth 2.1* remote servers — a user-pasted bearer token is not
accepted. Reaching Reshimit from your phone therefore needs two things: **public
HTTPS** and **no bearer-token requirement**.

The Compose stack ships this configuration. A `caddy` service terminates TLS and
reverse-proxies to the MCP server, which is switched to **loopback bind + authless**
so it is only reachable *through* Caddy:

| Service | Binds | Auth |
| --- | --- | --- |
| `mcp` | `127.0.0.1:8000` (loopback only) | `RESHIMIT_MCP_AUTH=none` |
| `caddy` | `0.0.0.0:443` (+ `:80` for ACME) | — terminates TLS, proxies to `localhost:8000` |

Because there is no token, the public endpoint is guarded **by the network instead**:
Caddy is the only thing listening publicly, and you should firewall its ports to
Anthropic's published egress range so the open internet can't reach it (see below).
Anyone allowed through can drive the backend, so this matches Reshimit's existing
"anyone with the link" trust model — don't use authless for data you actually need
to protect.

**Set up the certificate and firewall:**

1. **Point the hostname at the server.** `RESHIMIT_PUBLIC_HOST` in
   `docker/docker-compose.yml` (and the matching `docker/Caddyfile`) must resolve to
   this machine's public IP. The bundled value is the deployment's auto-DNS name.
2. **Open the ports.** Caddy needs inbound **TCP 80** (Let's Encrypt HTTP challenge
   + HTTP→HTTPS redirect) and **TCP 443** (serving) reachable from the internet.
3. **Start the stack.** `docker compose up --build` brings up `caddy` alongside the
   rest. On first start Caddy automatically requests a Let's Encrypt certificate for
   `RESHIMIT_PUBLIC_HOST` and renews it from then on — there is no manual cert step.
   Watch it happen with:
   ```bash
   docker compose logs -f caddy
   ```
   A line like `certificate obtained successfully` means TLS is live at
   `https://<RESHIMIT_PUBLIC_HOST>/mcp`. (If issuance fails because the host is a
   shared auto-DNS name that has hit Let's Encrypt's rate limit, use a hostname you
   control instead.)
4. **Lock 443 to Anthropic.** Since the server is authless, restrict inbound 443 to
   Anthropic's published egress IP range so only Claude's connector can reach it, for
   example with `ufw`:
   ```bash
   sudo ufw allow 80/tcp                      # keep 80 open for cert renewal
   sudo ufw allow from <ANTHROPIC_EGRESS_CIDR> to any port 443 proto tcp
   sudo ufw deny 443/tcp
   ```
   Anthropic publishes the current egress range in its connector docs; add each CIDR.
5. **Add the connector.** In Claude (web or mobile) → **Settings → Connectors → Add
   custom connector**, give it the URL `https://<RESHIMIT_PUBLIC_HOST>/mcp` and leave
   authentication empty.

To go back to a private, token-authenticated server (e.g. for Claude Code only),
drop the `caddy` service and set `RESHIMIT_MCP_AUTH=token` on the `mcp` service.

### Concurrency

Like the web UI, the MCP server does read-modify-write on the whole collection, so
simultaneous edits to the same collection can overwrite one another (last write wins).
