/**
 * Relay server for the pixel-art agent ecosystem dashboard.
 *
 * Responsibility: hold canonical in-memory state about agents/feed items,
 * and rebroadcast changes to connected dashboard clients over WebSocket
 * (/live). State gets updated two ways:
 *
 *   1. POST /events — a documented, stable HTTP contract (see README.md)
 *      for anything you write yourself (a plugin, a skill, a poller) to
 *      push events to.
 *   2. A live connection to OpenClaw's own Gateway WebSocket, if
 *      OPENCLAW_GATEWAY_WS_URL is set — see openclawGatewayAdapter.js for
 *      exactly what's verified (transport/handshake/method names, sourced
 *      from openclaw/openclaw's docs/gateway/protocol.md) vs best-effort
 *      (exact payload field names, since the protocol doc names events and
 *      methods but not every field inside them).
 *
 * Both paths flow through the same applyEvent() below, so the dashboard
 * behaves identically regardless of which one is feeding it.
 */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const openclawGateway = require('./openclawGatewayAdapter');

const PORT = process.env.PORT || 8787;
const INGEST_SECRET = process.env.RELAY_INGEST_SECRET || '';
const OPENCLAW_CALLBACK_URL = process.env.OPENCLAW_CALLBACK_URL || '';
const OPENCLAW_GATEWAY_WS_URL = process.env.OPENCLAW_GATEWAY_WS_URL || '';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

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

/**
 * Applies one canonical event to in-memory state and rebroadcasts it to
 * every connected dashboard. Shared by POST /events and the OpenClaw
 * Gateway adapter (when OPENCLAW_GATEWAY_WS_URL is configured) so both
 * paths behave identically. Returns an error string, or null on success.
 */
function applyEvent(evt) {
  if (!evt || typeof evt.type !== 'string') return 'event must have a string "type"';

  switch (evt.type) {
    case 'agent_update': {
      const a = evt.agent || evt;
      if (!a.id) return 'agent_update requires agent.id';
      const existing = state.agents.get(a.id) || {};
      state.agents.set(a.id, { ...existing, ...a });
      break;
    }
    case 'proposal':
    case 'error_alert': {
      if (!evt.id) return `${evt.type} requires an id`;
      state.pending.set(evt.id, { type: evt.type, agentId: evt.agentId });
      break;
    }
    case 'resolved': {
      if (!evt.id) return 'resolved requires an id';
      state.pending.delete(evt.id);
      break;
    }
    case 'log':
      break; // nothing to persist
    default:
      return `unknown event type "${evt.type}"`;
  }

  broadcast(evt);
  return null;
}

// ---- optional: live OpenClaw Gateway connection ----
// See openclawGatewayAdapter.js for exactly what's verified vs best-effort
// about this integration. Only activates if both env vars are set.
let gatewayAdapter = null;
if (OPENCLAW_GATEWAY_WS_URL) {
  gatewayAdapter = openclawGateway.connect(
    { url: OPENCLAW_GATEWAY_WS_URL, token: OPENCLAW_GATEWAY_TOKEN },
    (evt) => applyEvent(evt)
  );
  console.log(`[relay] connecting to OpenClaw Gateway at ${OPENCLAW_GATEWAY_WS_URL}`);
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
  const err = applyEvent(req.body);
  if (err) return res.status(400).json({ error: err });
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
async function handleOperatorAction(id, action) {
  const pending = state.pending.get(id);
  state.pending.delete(id);
  broadcast({ type: 'resolved', id, outcome: action });

  // If we're live-connected to a Gateway, tell it directly instead of (or
  // as well as) the generic HTTP callback below.
  if (gatewayAdapter) {
    const decision = action === 'approved' || action === 'retry' ? 'approve' : 'reject';
    gatewayAdapter.resolveApproval({ id, kind: pending && pending.type, decision }).catch((err) =>
      console.warn('[relay] gateway approval.resolve failed:', err.message)
    );
  }

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
}

app.post('/operator-action', requireSecret, async (req, res) => {
  const { id, action } = req.body || {};
  if (!id || !action) {
    return res.status(400).json({ error: 'operator-action requires id and action' });
  }
  await handleOperatorAction(id, action);
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
      handleOperatorAction(evt.id, evt.action).catch((err) =>
        console.warn('[relay] operator action handling failed:', err.message)
      );
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
