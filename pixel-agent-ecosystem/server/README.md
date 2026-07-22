# Agent Ecosystem Relay

A small Node/Express + WebSocket server that sits between a real agent
backend (e.g. OpenClaw) and the pixel-art dashboard in
`pixel-agent-ecosystem/index.html`.

## Why this exists

The dashboard's demo mode makes up its own fake data client-side. This
relay is what "Live" mode connects to instead: it holds canonical state
about agents and pending decisions (proposals/error alerts), and
broadcasts changes to every connected dashboard over WebSocket.

**Important caveat:** OpenClaw's exact wire protocol (Gateway WebSocket
auth + message schemas) was not verified against a live instance while
this was built - the public docs/blog posts describe the shape of the
system (a Gateway multiplexing WS+HTTP for session/tool/channel
orchestration, plus Skills/Plugins/Webhooks as extension points) but not
literal JSON payloads. So rather than guess and pretend it works, this
relay exposes a **documented, stable HTTP contract of its own**
(`POST /events`) that you point something at once you know how your
OpenClaw setup should report status. That "something" could be a small
OpenClaw Plugin, a Skill, or just a script that polls OpenClaw and posts
here.

If you'd rather connect directly to OpenClaw's Gateway WebSocket instead
of writing an adapter that POSTs to `/events`, see
`openclawGatewayAdapter.js` - it's an explicitly unverified sketch of
that path, not wired up by default.

## Running it

```bash
cd pixel-agent-ecosystem/server
npm install
cp .env.example .env   # then edit RELAY_INGEST_SECRET etc.
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
`room` must be one of `bridge`, `workshop`, `treasury`, `radar`.
`status` one of `active`, `paused`, `error`, `idle`. `timer` is seconds
remaining, only meaningful while `status` is `paused`. Any field can be
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
connected dashboard, and - if you set `OPENCLAW_CALLBACK_URL` in
`.env` - makes a best-effort POST of `{ id, action, pending }` there so
your OpenClaw-side integration can act on the decision. That callback
URL isn't a real OpenClaw endpoint; it's wherever you build to receive
it.
