/**
 * Relay server for the pixel-art agent ecosystem dashboard.
 *
 * Responsibility: hold canonical in-memory state about agents/feed items,
 * accept normalized events over HTTP (POST /events) from whatever talks to
 * your real agent backend, and rebroadcast them to connected dashboard
 * clients over WebSocket (/live).
 *
 * This deliberately does NOT assume a specific OpenClaw wire protocol -
 * OpenClaw's Gateway WebSocket auth/message format was not confirmed
 * against a live instance while this was written. Instead it exposes a
 * documented, stable HTTP contract (see README.md) that something you
 * write later (a plugin, a skill, a small poller) can POST to. See
 * openclawGatewayAdapter.js for an optional, unverified sketch of a more
 * direct integration.
 */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const INGEST_SECRET = process.env.RELAY_INGEST_SECRET || '';
const OPENCLAW_CALLBACK_URL = process.env.OPENCLAW_CALLBACK_URL || '';

const app = express();
app.use(express.json());

// ---- canonical in-memory state ----
const state = {
  agents: new Map(), // id -> { id, name, room, status, task, timer }
  pending: new Map() // id -> { type: 'proposal' | 'error_alert', agentId }
};

const clients = new Set();

function broadcast(evt) {
  const payload = JSON.stringify(evt);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function requireSecret(req, res, next) {
  if (!INGEST_SECRET) return next(); // no secret configured -> open (local/dev use)
  const provided = req.header('x-relay-secret');
  if (provided !== INGEST_SECRET) {
    return res.status(401).json({ error: 'invalid or missing x-relay-secret header' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, agents: state.agents.size, clients: clients.size });
});

app.get('/state', (req, res) => {
  res.json({ type: 'snapshot', agents: Array.from(state.agents.values()) });
});

/**
 * POST /events
 * Body is one canonical event. Documented shapes (see README.md):
 *
 *   { type: 'agent_update', agent: { id, name?, room?, status?, task?, timer?, x?, y? } }
 *   { type: 'log', kind: 'info'|'success'|'warning'|'error', text }
 *   { type: 'proposal', id, title, body, agentName? }
 *   { type: 'error_alert', id, agentId?, agentName?, title, body }
 *   { type: 'resolved', id, outcome: 'approved'|'rejected'|'retry'|'terminate' }
 */
app.post('/events', requireSecret, (req, res) => {
  const evt = req.body;
  if (!evt || typeof evt.type !== 'string') {
    return res.status(400).json({ error: 'event must have a string "type"' });
  }

  switch (evt.type) {
    case 'agent_update': {
      const a = evt.agent || evt;
      if (!a.id) return res.status(400).json({ error: 'agent_update requires agent.id' });
      const existing = state.agents.get(a.id) || {};
      state.agents.set(a.id, { ...existing, ...a });
      break;
    }
    case 'proposal':
    case 'error_alert': {
      if (!evt.id) return res.status(400).json({ error: `${evt.type} requires an id` });
      state.pending.set(evt.id, { type: evt.type, agentId: evt.agentId });
      break;
    }
    case 'resolved': {
      if (!evt.id) return res.status(400).json({ error: 'resolved requires an id' });
      state.pending.delete(evt.id);
      break;
    }
    case 'log':
      break; // nothing to persist
    default:
      return res.status(400).json({ error: `unknown event type "${evt.type}"` });
  }

  broadcast(evt);
  res.status(202).json({ ok: true });
});

/**
 * POST /operator-action
 * Sent by the dashboard when a human clicks Approve/Reject/Retry/Terminate
 * on a proposal or error card. Body: { id, action }.
 *
 * This relay applies it locally (marks the pending item resolved and
 * rebroadcasts a `resolved` event to every connected dashboard so all
 * viewers stay in sync) and, if OPENCLAW_CALLBACK_URL is set, makes a
 * best-effort forward so your OpenClaw-side integration can react.
 */
app.post('/operator-action', requireSecret, async (req, res) => {
  const { id, action } = req.body || {};
  if (!id || !action) {
    return res.status(400).json({ error: 'operator-action requires id and action' });
  }

  const pending = state.pending.get(id);
  state.pending.delete(id);
  broadcast({ type: 'resolved', id, outcome: action });

  if (OPENCLAW_CALLBACK_URL) {
    try {
      await fetch(OPENCLAW_CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, pending }),
      });
    } catch (err) {
      console.warn('[relay] failed to forward operator action to OPENCLAW_CALLBACK_URL:', err.message);
    }
  }

  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'snapshot', agents: Array.from(state.agents.values()) }));

  ws.on('message', (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // Dashboard clients may send operator_action over the socket instead of
    // the HTTP endpoint - handle both the same way.
    if (evt.type === 'operator_action' && evt.id && evt.action) {
      state.pending.delete(evt.id);
      broadcast({ type: 'resolved', id: evt.id, outcome: evt.action });
      if (OPENCLAW_CALLBACK_URL) {
        fetch(OPENCLAW_CALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: evt.id, action: evt.action }),
        }).catch((err) => console.warn('[relay] callback forward failed:', err.message));
      }
    }
  });

  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}  (HTTP + WS /live)`);
  if (!INGEST_SECRET) {
    console.warn('[relay] RELAY_INGEST_SECRET is not set - /events and /operator-action are unauthenticated.');
  }
});
