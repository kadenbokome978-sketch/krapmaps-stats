/**
 * OPTIONAL, UNVERIFIED sketch.
 *
 * The default integration path for this relay is: something on the
 * OpenClaw side (a Plugin, a Skill, or a small poller you write) calls
 * POST /events on this relay using the documented shapes in README.md.
 * That only requires OpenClaw to be able to make an outbound HTTP call,
 * which is well-documented, and avoids guessing at internals.
 *
 * This file sketches the alternative: connecting directly to OpenClaw's
 * Gateway as a WebSocket client (the way a "Mission Control"-style tool
 * would) and translating Gateway events into this relay's canonical
 * events, instead of requiring an OpenClaw-side adapter at all.
 *
 * It is NOT wired up by default and is NOT known-working. The Gateway's
 * exact auth handshake and message schema were not confirmed against a
 * live instance - public sources describe the Gateway as multiplexing
 * WebSocket + HTTP for session/tool/channel orchestration, but not the
 * literal JSON shapes. Fill those in once you have a real Gateway to
 * inspect (its own client, or browser devtools against Mission Control,
 * will show you the real message shapes), then call connect() from
 * index.js if you want this path instead of / in addition to /events.
 */

const WebSocket = require('ws');

/**
 * @param {object} opts
 * @param {string} opts.url - e.g. ws://localhost:19001 (UNVERIFIED default port)
 * @param {string} opts.token - however the Gateway expects to be authenticated (UNVERIFIED)
 * @param {(canonicalEvent: object) => void} onEvent - call this with a canonical
 *   event ({type:'agent_update'|'log'|'proposal'|'error_alert', ...}) whenever you've
 *   translated something the Gateway sent.
 */
function connect({ url, token }, onEvent) {
  if (!url) throw new Error('openclawGatewayAdapter.connect requires opts.url');

  const ws = new WebSocket(url, {
    // UNVERIFIED: guessing bearer-token-in-header auth. Replace with
    // whatever the Gateway actually expects (query param, first-message
    // auth frame, etc.) once known.
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  ws.on('open', () => {
    console.log('[openclawGatewayAdapter] connected to Gateway at', url);
    // UNVERIFIED: some Gateways expect an explicit subscribe/hello frame
    // as the first message rather than starting to stream immediately.
    // e.g. ws.send(JSON.stringify({ type: 'subscribe', channel: 'agents' }));
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const canonical = translateGatewayMessage(msg);
    if (canonical) onEvent(canonical);
  });

  ws.on('error', (err) => {
    console.warn('[openclawGatewayAdapter] socket error:', err.message);
  });

  ws.on('close', () => {
    console.warn('[openclawGatewayAdapter] disconnected from Gateway, not auto-reconnecting');
  });

  return ws;
}

/**
 * UNVERIFIED: this is a placeholder mapping. Replace the field names
 * once you can see real Gateway payloads. The goal shape on the way out
 * is always one of the canonical events documented in README.md.
 */
function translateGatewayMessage(msg) {
  // Example best-guess shape - almost certainly needs adjusting:
  // { type: 'session.update', sessionId, agentName, room, status, currentTask }
  if (msg.type === 'session.update') {
    return {
      type: 'agent_update',
      agent: {
        id: msg.sessionId,
        name: msg.agentName,
        room: msg.room,
        status: msg.status,
        task: msg.currentTask,
      },
    };
  }
  return null;
}

module.exports = { connect };
