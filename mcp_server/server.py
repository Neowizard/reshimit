# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.2.0",
#     "httpx>=0.27",
#     "uvicorn>=0.30",
#     "starlette>=0.37",
# ]
# ///
"""Reshimit MCP server.

Exposes CRUD tools over a running reshimit backend (the Flask app in
``backend/app.py``). Each reshimit "collection" is addressed by a *route*
(an alphanumeric id, max 16 chars) and holds an ordered set of named lists,
each of which holds an ordered set of todos.

The server talks to the backend over HTTP using the same GET/PUT contract the
web frontend uses, so edits made here show up live in any open browser and are
written through the backend's locking + rotating-backup machinery.

The server runs as a streamable-HTTP service and mints a bearer token on boot; every
client request must carry ``Authorization: Bearer <token>`` or it is rejected with
401. The token is printed to stderr at startup.

Configuration (environment variables):
    RESHIMIT_BACKEND_URL  Base URL of the backend. Default: http://localhost:4434
    RESHIMIT_ROUTE        Optional default route, used when a tool's ``route``
                          argument is omitted.
    RESHIMIT_MCP_HOST     Interface to bind. Default: 127.0.0.1 (loopback only).
    RESHIMIT_MCP_PORT     Port to bind. Default: 8000.
    RESHIMIT_MCP_TOKEN    Pin the bearer token instead of generating one on boot.
    RESHIMIT_MCP_AUTH     "token" (default) requires Authorization: Bearer <token>
                          on every request; "none" disables auth entirely. Use
                          "none" only when something else guards the server
                          (e.g. it is bound to loopback behind a TLS reverse
                          proxy whose port is firewalled to trusted clients) —
                          notably so Claude's web/mobile connector, which cannot
                          send a static bearer token, can reach it.
    RESHIMIT_MCP_ALLOWED_HOSTS
                          Hosts to accept in the Host/Origin headers when the
                          server is reached under a non-localhost name. Unset =
                          localhost only (the SDK default); "*" = accept any host
                          (token is the trust boundary); or a comma-separated list
                          of host[:port] to allow alongside localhost.
"""

from __future__ import annotations

import os
import secrets
import sys
import uuid
from typing import Any

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

BACKEND_URL = os.environ.get("RESHIMIT_BACKEND_URL", "http://localhost:4434").rstrip("/")
DEFAULT_ROUTE = os.environ.get("RESHIMIT_ROUTE") or None
CLIENT_ID = f"mcp-{uuid.uuid4().hex[:8]}"

# Where the MCP server listens. Defaults to loopback so it isn't exposed unless asked.
MCP_HOST = os.environ.get("RESHIMIT_MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.environ.get("RESHIMIT_MCP_PORT", "8000"))
# Bearer token every client must present. Minted fresh on boot unless pinned via env.
MCP_TOKEN = os.environ.get("RESHIMIT_MCP_TOKEN") or secrets.token_urlsafe(32)
# Auth mode: "token" (require the bearer token) or "none" (no auth at all). Authless
# is for deployments fronted by another guard — e.g. bound to loopback behind a TLS
# reverse proxy whose port is firewalled to trusted callers — so clients that can't
# send a static bearer token (Claude's web/mobile connector) can still connect.
MCP_AUTH = os.environ.get("RESHIMIT_MCP_AUTH", "token").strip().lower()
# Hosts the MCP transport will accept in the Host/Origin headers. The SDK enables
# DNS-rebinding protection by default and only allows localhost, so any request
# reaching the server under a public hostname is rejected with 421 "Invalid Host
# header". When the server is exposed (e.g. behind a public DNS name in Docker),
# set this so those requests are accepted:
#   unset  -> keep the SDK default (localhost only)
#   "*"    -> disable host checking entirely (the bearer token is the boundary)
#   a comma-separated list of host[:port] -> allow those in addition to localhost
MCP_ALLOWED_HOSTS = os.environ.get("RESHIMIT_MCP_ALLOWED_HOSTS")

# Colors the frontend knows how to render. Anything else won't show a swatch.
VALID_COLORS = {"red", "pink", "purple", "blue", "teal", "green", "yellow", "white"}


def _transport_security() -> TransportSecuritySettings | None:
    """Build transport-security settings from RESHIMIT_MCP_ALLOWED_HOSTS.

    Returns ``None`` when the env var is unset so we leave FastMCP's secure
    localhost-only default in place (passing ``transport_security=None`` to
    FastMCP would *disable* protection, which we don't want here).
    """
    if not MCP_ALLOWED_HOSTS:
        return None
    if MCP_ALLOWED_HOSTS.strip() == "*":
        # Token auth is the trust boundary; turn off host validation entirely.
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)
    extra = [h.strip() for h in MCP_ALLOWED_HOSTS.split(",") if h.strip()]
    localhost_hosts = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
    localhost_origins = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]
    allowed_origins: list[str] = []
    for h in extra:
        allowed_origins.append(f"http://{h}")
        allowed_origins.append(f"https://{h}")
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=localhost_hosts + extra,
        allowed_origins=localhost_origins + allowed_origins,
    )


_security = _transport_security()
mcp = FastMCP("reshimit", transport_security=_security) if _security else FastMCP("reshimit")


class ReshimitError(Exception):
    """A user-facing error (bad input or backend problem)."""


# --------------------------------------------------------------------------- #
# Backend client
# --------------------------------------------------------------------------- #
class ReshimitClient:
    """Thin HTTP client implementing read-modify-write against the backend.

    Mutations follow the same pattern as the web frontend: GET the whole
    collection, change it in memory, then PUT the whole thing back.
    """

    def __init__(self, base_url: str = BACKEND_URL, client_id: str = CLIENT_ID,
                 timeout: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self._http = httpx.Client(timeout=timeout)

    # -- low-level ---------------------------------------------------------- #
    def _resolve_route(self, route: str | None) -> str:
        route = route or DEFAULT_ROUTE
        if not route:
            raise ReshimitError(
                "No route given and RESHIMIT_ROUTE is not set. Pass route=... or "
                "create a collection first with create_collection()."
            )
        if len(route) > 16 or not route.isalnum():
            raise ReshimitError(
                f"Invalid route {route!r}: must be alphanumeric and at most 16 characters."
            )
        return route

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            resp = self._http.request(method, f"{self.base_url}{path}", **kwargs)
        except httpx.ConnectError as exc:
            raise ReshimitError(
                f"Could not reach the reshimit backend at {self.base_url}. "
                f"Is it running? (cd backend && python app.py)"
            ) from exc
        except httpx.HTTPError as exc:
            raise ReshimitError(f"HTTP request to backend failed: {exc}") from exc
        if resp.status_code >= 400:
            detail = resp.text.strip()
            raise ReshimitError(
                f"Backend returned {resp.status_code} for {method} {path}: {detail}"
            )
        return resp

    def create_collection(self) -> str:
        resp = self._request("GET", "/new")
        return resp.json()["route"]

    def get_lists(self, route: str | None) -> list[dict[str, Any]]:
        route = self._resolve_route(route)
        data = self._request("GET", f"/{route}").json()
        if not isinstance(data, list):
            raise ReshimitError(f"Unexpected payload for route {route!r}: {data!r}")
        return data

    def save_lists(self, route: str | None, lists: list[dict[str, Any]]) -> None:
        route = self._resolve_route(route)
        self._request(
            "PUT", f"/{route}", json=lists,
            headers={"X-Client-ID": self.client_id, "Content-Type": "application/json"},
        )


_client: ReshimitClient | None = None


def client() -> ReshimitClient:
    global _client
    if _client is None:
        _client = ReshimitClient()
    return _client


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _resolve_list_index(
    lists: list[dict[str, Any]],
    list_name: str | None,
    list_index: int | None,
) -> int:
    """Resolve a list reference to an index. ``list_index`` wins if given."""
    if list_index is not None:
        if list_index < 0 or list_index >= len(lists):
            raise ReshimitError(
                f"list_index {list_index} is out of range (collection has {len(lists)} list(s))."
            )
        return list_index
    if list_name is None:
        raise ReshimitError("Provide either list_name or list_index.")
    matches = [i for i, lst in enumerate(lists) if lst.get("name") == list_name]
    if not matches:
        names = ", ".join(repr(lst.get("name")) for lst in lists) or "(none)"
        raise ReshimitError(f"No list named {list_name!r}. Available lists: {names}.")
    if len(matches) > 1:
        raise ReshimitError(
            f"{len(matches)} lists are named {list_name!r} (indices {matches}). "
            f"Disambiguate with list_index."
        )
    return matches[0]


def _check_colors(colors: list[str] | None) -> list[str]:
    if colors is None:
        return ["white"]
    invalid = [c for c in colors if c not in VALID_COLORS]
    if invalid:
        raise ReshimitError(
            f"Unknown color(s) {invalid}. Valid colors: {sorted(VALID_COLORS)}."
        )
    return colors


def _todo_view(todo: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "index": index,
        "text": todo.get("text", ""),
        "completed": bool(todo.get("completed", False)),
        "colors": todo.get("colors", []),
    }


def _list_view(lst: dict[str, Any], index: int) -> dict[str, Any]:
    todos = lst.get("todos", []) or []
    return {
        "index": index,
        "name": lst.get("name", ""),
        "todo_count": len(todos),
        "todos": [_todo_view(t, i) for i, t in enumerate(todos)],
    }


# --------------------------------------------------------------------------- #
# Tools — collections
# --------------------------------------------------------------------------- #
@mcp.tool()
def create_collection() -> dict[str, Any]:
    """Create a brand-new todo collection and return its route id.

    A collection starts with a single empty list named "Default". Use the
    returned ``route`` in subsequent calls (or set RESHIMIT_ROUTE to make it
    the default).
    """
    route = client().create_collection()
    return {"route": route, "url": f"{BACKEND_URL}/{route}"}


@mcp.tool()
def get_lists(route: str | None = None) -> dict[str, Any]:
    """Read a whole collection: every list and its todos, with indices.

    Indices shown here are what you pass back as ``list_index`` / ``todo_index``
    to the update and delete tools.
    """
    lists = client().get_lists(route)
    return {
        "route": route or DEFAULT_ROUTE,
        "list_count": len(lists),
        "lists": [_list_view(lst, i) for i, lst in enumerate(lists)],
    }


# --------------------------------------------------------------------------- #
# Tools — lists
# --------------------------------------------------------------------------- #
@mcp.tool()
def add_list(name: str, route: str | None = None) -> dict[str, Any]:
    """Add a new (empty) named list to the collection."""
    if not name.strip():
        raise ReshimitError("List name cannot be empty.")
    lists = client().get_lists(route)
    lists.append({"name": name, "todos": []})
    client().save_lists(route, lists)
    return {"ok": True, "list_index": len(lists) - 1, "name": name}


@mcp.tool()
def rename_list(
    new_name: str,
    list_name: str | None = None,
    list_index: int | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Rename a list. Identify it with list_name or list_index."""
    if not new_name.strip():
        raise ReshimitError("New list name cannot be empty.")
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    old = lists[idx].get("name")
    lists[idx]["name"] = new_name
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "old_name": old, "new_name": new_name}


@mcp.tool()
def delete_list(
    list_name: str | None = None,
    list_index: int | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Delete an entire list (and all its todos). Identify it with list_name or list_index."""
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    removed = lists.pop(idx)
    client().save_lists(route, lists)
    return {"ok": True, "deleted": removed.get("name"), "remaining_lists": len(lists)}


# --------------------------------------------------------------------------- #
# Tools — todos
# --------------------------------------------------------------------------- #
@mcp.tool()
def add_todo(
    text: str,
    list_name: str | None = None,
    list_index: int | None = None,
    colors: list[str] | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Add a todo to a list.

    ``colors`` is an optional list of color tags (defaults to ["white"]); valid
    values: red, pink, purple, blue, teal, green, yellow, white.
    """
    if not text.strip():
        raise ReshimitError("Todo text cannot be empty.")
    colors = _check_colors(colors)
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    todos = lists[idx].setdefault("todos", [])
    todos.append({"text": text, "completed": False, "colors": colors})
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "todo_index": len(todos) - 1, "text": text}


@mcp.tool()
def update_todo(
    todo_index: int,
    list_name: str | None = None,
    list_index: int | None = None,
    text: str | None = None,
    completed: bool | None = None,
    colors: list[str] | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Update fields of a single todo. Only the fields you pass are changed.

    Identify the list with list_name or list_index, and the todo with its
    todo_index (see get_lists). Pass any of text, completed, colors.
    """
    if text is None and completed is None and colors is None:
        raise ReshimitError("Nothing to update: pass at least one of text, completed, colors.")
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    todos = lists[idx].get("todos", []) or []
    if todo_index < 0 or todo_index >= len(todos):
        raise ReshimitError(
            f"todo_index {todo_index} is out of range (list has {len(todos)} todo(s))."
        )
    todo = todos[todo_index]
    if text is not None:
        if not text.strip():
            raise ReshimitError("Todo text cannot be empty.")
        todo["text"] = text
    if completed is not None:
        todo["completed"] = completed
    if colors is not None:
        todo["colors"] = _check_colors(colors)
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "todo": _todo_view(todo, todo_index)}


@mcp.tool()
def toggle_todo(
    todo_index: int,
    list_name: str | None = None,
    list_index: int | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Flip a todo's completed state."""
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    todos = lists[idx].get("todos", []) or []
    if todo_index < 0 or todo_index >= len(todos):
        raise ReshimitError(
            f"todo_index {todo_index} is out of range (list has {len(todos)} todo(s))."
        )
    todos[todo_index]["completed"] = not todos[todo_index].get("completed", False)
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "todo": _todo_view(todos[todo_index], todo_index)}


@mcp.tool()
def delete_todo(
    todo_index: int,
    list_name: str | None = None,
    list_index: int | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Delete a single todo by its index within a list."""
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    todos = lists[idx].get("todos", []) or []
    if todo_index < 0 or todo_index >= len(todos):
        raise ReshimitError(
            f"todo_index {todo_index} is out of range (list has {len(todos)} todo(s))."
        )
    removed = todos.pop(todo_index)
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "deleted": removed.get("text"), "remaining_todos": len(todos)}


@mcp.tool()
def clear_completed(
    list_name: str | None = None,
    list_index: int | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    """Remove every completed todo from a list."""
    lists = client().get_lists(route)
    idx = _resolve_list_index(lists, list_name, list_index)
    todos = lists[idx].get("todos", []) or []
    kept = [t for t in todos if not t.get("completed", False)]
    removed = len(todos) - len(kept)
    lists[idx]["todos"] = kept
    client().save_lists(route, lists)
    return {"ok": True, "list_index": idx, "removed": removed, "remaining_todos": len(kept)}


# --------------------------------------------------------------------------- #
# Transport: token-authenticated streamable HTTP
# --------------------------------------------------------------------------- #
class TokenAuthMiddleware:
    """Require ``Authorization: Bearer <token>`` on every HTTP request.

    Implemented at the raw ASGI layer (not Starlette's ``BaseHTTPMiddleware``) so it
    never buffers the streaming responses the MCP transport depends on.
    """

    def __init__(self, app, token: str) -> None:
        self.app = app
        self._token = token.encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        header = dict(scope.get("headers", [])).get(b"authorization", b"")
        prefix = b"Bearer "
        provided = header[len(prefix):] if header.startswith(prefix) else b""
        if not provided or not secrets.compare_digest(provided, self._token):
            body = b'{"error": "unauthorized"}'
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"www-authenticate", b'Bearer realm="reshimit"'),
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)


def build_app():
    """Build the streamable-HTTP ASGI app, gating it with token auth unless disabled."""
    app = mcp.streamable_http_app()
    if MCP_AUTH != "none":
        app.add_middleware(TokenAuthMiddleware, token=MCP_TOKEN)
    return app


if __name__ == "__main__":
    authless = MCP_AUTH == "none"
    headline = (
        "reshimit MCP server — streamable HTTP, AUTHLESS (no token required)"
        if authless
        else "reshimit MCP server — streamable HTTP, token-authenticated"
    )
    print("=" * 64, file=sys.stderr)
    print(headline, file=sys.stderr)
    print(f"  endpoint : http://{MCP_HOST}:{MCP_PORT}/mcp", file=sys.stderr)
    print(f"  backend  : {BACKEND_URL}", file=sys.stderr)
    if MCP_ALLOWED_HOSTS:
        print(f"  hosts    : {MCP_ALLOWED_HOSTS}", file=sys.stderr)
    if authless:
        print("  auth     : DISABLED — guard this endpoint by other means", file=sys.stderr)
        print("             (loopback bind + TLS proxy + firewall to trusted IPs)", file=sys.stderr)
    else:
        print(f"  token    : {MCP_TOKEN}", file=sys.stderr)
        print("  clients must send header:  Authorization: Bearer <token>", file=sys.stderr)
    print("=" * 64, file=sys.stderr)
    uvicorn.run(build_app(), host=MCP_HOST, port=MCP_PORT, log_level="warning")
