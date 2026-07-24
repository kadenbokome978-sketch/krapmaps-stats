# Agent Ecosystem Relay

A small Node/Express + WebSocket server that sits between a real agent
backend (e.g. OpenClaw) and the pixel-art dashboard in
`pixel-agent-ecosystem/index.html`.

## Why this exists

The dashboard's demo mode makes up its own fake data client-side. This
relay is what "Live" mode connects to instead: it holds canonical state
about agents and pending decisions (proposals/error alerts), and
broadcasts changes to every connected dashboard over WebSocket.

## Two ways to feed it real data

**Option A — connect directly to OpenClaw's Gateway (recommended).**
`openclawGatewayAdapter.js` connects to your OpenClaw instance's own
Gateway WebSocket (the same control plane its CLI/TUI/mobile clients use)
and translates what it reports into this relay's canonical events. The
transport, handshake sequence, and method/event *names* are verified
against `openclaw/openclaw`'s own `docs/gateway/protocol.md` — not
guessed. What's still best-effort is the exact field names *inside* some
payloads, since that source documents method/event names but not every
field; the adapter logs `[openclawGatewayAdapter] unmapped ...` lines for
any shape it can't confidently map, so real mismatches are visible in the
server logs rather than silently wrong.

To use it, run this relay **on the same machine as the OpenClaw gateway**
(it's loopback-only by default) and set:

```bash
OPENCLAW_GATEWAY_WS_URL=ws://127.0.0.1:18789   # the port OpenClaw's own onboarding printed
OPENCLAW_GATEWAY_TOKEN=<your gateway token>     # see below for where to find it
```

Finding the token: it's whatever OpenClaw's onboarding configured for
Gateway auth (Token mode by default). Check `~/.openclaw/openclaw.json`
on the server, or run `openclaw gateway status` — one of those will show
or let you regenerate it.

**Option B — POST events yourself.** If you'd rather not rely on the
Gateway adapter's best-effort field mapping, this relay also exposes a
**documented, stable HTTP contract of its own** (`POST /events`, shapes
below) that you can point a Skill, Plugin, or small poller at instead.
The two options aren't mutually exclusive — both flow into the same
state and broadcast to the same dashboard.

## Running it

```bash
cd pixel-agent-ecosystem/server
npm install
cp .env.example .env   # then edit RELAY_INGEST_SECRET, and OPENCLAW_GATEWAY_* if using Option A
npm start
```

By default it listens on `:8787` and exposes:

- `GET  /health` - liveness check
- `GET  /state` - current snapshot as JSON
- `POST /events` - ingest a canonical event (see below)
- `POST /operator-action` - forwarded from the dashboard when a human
  clicks Approve/Reject/Retry/Terminate
- `WS   /live` - what the dashboard's "Live" mode connects to

Then in the dashboard, flip the **LIVE FEED** switch in the top bar and
point the relay URL field at `ws://<host>:8787/live`.

## Canonical event shapes (`POST /events`)

All requests need `Content-Type: application/json` and, if
`RELAY_INGEST_SECRET` is set in `.env`, an `x-relay-secret` header
matching it.

**Agent created or updated:**
```json
{
  "type": "agent_update",
  "agent": {
    "id": "agent-123",
    "name": "SCOUT",
    "room": "radar",
    "status": "active",
    "task": "Researching Business Idea",
    "timer": 0
  }
}
```
`room` must be one of `bridge`, `workshop`, `treasury`, `radar`, `research`.
`status` one of `active`, `paused`, `error`, `idle`. `timer` is seconds
remaining, only meaningful while `status` is `paused` (the dashboard shows
this as a "rate-limited" countdown chip). Any field can be
omitted on an update to an already-known agent - only provided fields
change.

**Log line for the feed panel:**
```json
{ "type": "log", "kind": "info", "text": "SCOUT started task: crawl trend feeds" }
```
`kind` is one of `info`, `success`, `warning`, `error`.

**Proposal needing human approval:**
```json
{
  "type": "proposal",
  "id": "proposal-abc",
  "title": "New business plan proposed",
  "body": "LEDGER proposes launching a niche Etsy shop...",
  "agentName": "LEDGER"
}
```

**Error alert needing human action:**
```json
{
  "type": "error_alert",
  "id": "error-abc",
  "agentId": "agent-123",
  "agentName": "SCOUT",
  "title": "SCOUT encountered a critical error",
  "body": "Unhandled exception in radar workspace."
}
```

**Externally resolving a pending item** (e.g. someone approved it from
Slack instead of the dashboard):
```json
{ "type": "resolved", "id": "proposal-abc", "outcome": "approved" }
```
`outcome` is `approved`/`rejected` for proposals, `retry`/`terminate` for
error alerts.

## Operator actions flowing back out

When a human clicks a button on the dashboard, it POSTs (or sends over
the open WebSocket) `{ "id": "...", "action": "approved" }` to this
relay. The relay immediately rebroadcasts a `resolved` event to every
connected dashboard, then:

- If the Gateway adapter (Option A) is connected, calls its verified
  `approval.resolve` method so the decision reaches OpenClaw directly.
- If `OPENCLAW_CALLBACK_URL` is set, also makes a best-effort POST of
  `{ id, action, pending }` there.

Both can be active at once if you want a custom integration in addition
to the direct Gateway path.
