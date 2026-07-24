/**
 * OpenClaw Gateway WebSocket adapter.
 *
 * Connects directly to a running OpenClaw instance's Gateway (the same
 * control plane its own CLI/TUI/mobile clients use) and translates what it
 * reports into this relay's canonical events, instead of requiring an
 * OpenClaw-side plugin/skill to POST to /events.
 *
 * VERIFIED against openclaw/openclaw's docs/gateway/protocol.md (source of
 * truth, not a blog post) as of writing:
 *   - Transport: WebSocket, text frames, JSON.
 *   - Handshake: server sends {type:"event", event:"connect.challenge",
 *     payload:{nonce, ts}} first. Client replies with
 *     {type:"req", id, method:"connect", params:{minProtocol, maxProtocol,
 *     client:{id, version, platform, mode}, role, scopes, auth:{token}}}.
 *     Server replies {type:"res", id, ok:true, payload:{type:"hello-ok", ...}}.
 *   - Requests: {type:"req", id, method, params} -> {type:"res", id, ok, payload|error}
 *   - Events:   {type:"event", event, payload, seq?, stateVersion?}
 *   - Discovery methods that exist: sessions.list, agents.list, status, health.
 *   - Subscribe methods: sessions.subscribe (session index changes ->
 *     "sessions.changed" events), sessions.messages.subscribe (per-session
 *     transcript/tool/operation/approval events).
 *   - Event names that exist: session.message, session.operation,
 *     session.tool, session.approval, sessions.changed, chat.
 *   - Approval response: approval.resolve (params include an approval id,
 *     a "kind", and a decision); exec.approval.resolve for plugin-defined
 *     exec approvals specifically.
 *   - client.id / client.mode are NOT free-form strings, despite what the
 *     protocol doc's own example implies (it shows id:"cli", mode:"operator"
 *     - "operator" is actually the *role*, not a valid client.mode; a live
 *     gateway rejects it). The real enums are defined in
 *     packages/gateway-protocol/src/client-info.ts: GATEWAY_CLIENT_IDS
 *     (this adapter uses "gateway-client", the value that contract defines
 *     for exactly this kind of integration) and GATEWAY_CLIENT_MODES (this
 *     adapter uses "backend"). platform is free-form (e.g. "linux").
 *
 * STILL UNVERIFIED (the protocol doc describes method/event *names* but not
 * every field inside their payloads): the exact keys inside an agents.list /
 * sessions.list row (e.g. whether status is called "status" or "state", how
 * a human-readable "current task" is represented), and the exact fields
 * inside session.tool / session.operation payloads. Rather than fabricate
 * those and silently misreport agent status, this adapter:
 *   1. Tries a handful of plausible field names defensively.
 *   2. Logs the raw payload the first time it sees a shape it can't map, so
 *      you can read real data from your own gateway and tighten the mapping.
 *   3. Falls back to polling agents.list/sessions.list on an interval, so
 *      the dashboard stays roughly correct even if event-field parsing
 *      misses something.
 *
 * If you run this against a real gateway and see console lines starting
 * with "[openclawGatewayAdapter] unmapped", paste one here (or into the
 * dashboard's log panel via /events) and the field mapping below can be
 * corrected precisely instead of guessed.
 */

const WebSocket = require('ws');

const DEFAULT_ROOM = process.env.OPENCLAW_DEFAULT_ROOM || 'bridge';
const POLL_INTERVAL_MS = 10_000;

let reqSeq = 0;
function nextId() {
  reqSeq += 1;
  return `relay-${Date.now()}-${reqSeq}`;
}

/**
 * @param {object} opts
 * @param {string} opts.url - e.g. ws://127.0.0.1:18789 (VERIFIED default
 *   gateway port from OpenClaw's own QuickStart onboarding output; loopback
 *   only unless you exposed it otherwise - run this adapter on the same
 *   host as the gateway).
 * @param {string} opts.token - the gateway's configured auth token (Token
 *   auth mode). Find it in ~/.openclaw/openclaw.json on the server, or
 *   wherever `openclaw onboard` printed/stored it.
 * @param {(canonicalEvent: object) => void} onEvent - called with a
 *   canonical relay event ({type:'agent_update'|'log'|'proposal'|
 *   'error_alert'|'resolved', ...}) whenever one can be derived.
 * @returns {{ ws: WebSocket, resolveApproval: Function, close: Function }}
 */
function connect({ url, token }, onEvent) {
  if (!url) throw new Error('openclawGatewayAdapter.connect requires opts.url');

  const pending = new Map(); // req id -> { resolve, reject }
  const knownSessions = new Set();
  const loggedUnmapped = new Set(); // avoid spamming the same unmapped shape

  let ws = new WebSocket(url);
  let pollTimer = null;
  let closed = false;

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId();
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type: 'req', id, method, params: params || {} }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`[openclawGatewayAdapter] request "${method}" timed out`));
        }
      }, 15_000);
    });
  }

  function logUnmapped(tag, payload) {
    const key = tag + ':' + Object.keys(payload || {}).sort().join(',');
    if (loggedUnmapped.has(key)) return;
    loggedUnmapped.add(key);
    console.log(`[openclawGatewayAdapter] unmapped ${tag} payload (fields: ${Object.keys(payload || {}).join(', ') || 'none'}):`, JSON.stringify(payload).slice(0, 500));
  }

  // Best-effort field extraction — see file header re: unverified shapes.
  function pick(obj, keys, fallback) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return fallback;
  }

  function normalizeStatus(raw) {
    const s = String(raw || '').toLowerCase();
    if (['active', 'running', 'working', 'busy'].includes(s)) return 'active';
    if (['error', 'failed', 'crashed'].includes(s)) return 'error';
    if (['paused', 'blocked', 'waiting', 'rate-limited', 'rate_limited'].includes(s)) return 'paused';
    if (['idle', 'ready'].includes(s)) return 'idle';
    return 'active'; // OpenClaw agents are working unless we have a reason to think otherwise
  }

  function agentFromRow(row) {
    const id = pick(row, ['id', 'sessionId', 'agentId', 'key', 'sessionKey']);
    if (!id) return null;
    return {
      id: String(id),
      name: pick(row, ['name', 'displayName', 'agentName', 'title'], String(id)),
      room: pick(row, ['room'], DEFAULT_ROOM),
      status: normalizeStatus(pick(row, ['status', 'state', 'runState'])),
      task: pick(row, ['task', 'currentTask', 'summary', 'lastMessage'], ''),
    };
  }

  async function seedAndSubscribe() {
    // Discovery: prefer agents.list (agent-shaped), fall back to
    // sessions.list (session-shaped, close enough - one session ~= one
    // agent for a typical single-agent-per-session OpenClaw setup).
    let rows = [];
    try {
      const res = await send('agents.list', {});
      rows = pick(res, ['agents', 'items', 'rows'], []);
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty agents.list');
    } catch {
      try {
        const res = await send('sessions.list', {});
        rows = pick(res, ['sessions', 'items', 'rows'], []);
      } catch (err) {
        console.warn('[openclawGatewayAdapter] could not list agents or sessions:', err.message);
        rows = [];
      }
    }

    if (!Array.isArray(rows)) {
      logUnmapped('agents.list/sessions.list result', rows);
      rows = [];
    }

    for (const row of rows) {
      const agent = agentFromRow(row);
      if (agent) {
        onEvent({ type: 'agent_update', agent });
        const sessionKey = pick(row, ['sessionKey', 'id', 'sessionId'], null);
        if (sessionKey && !knownSessions.has(sessionKey)) {
          knownSessions.add(sessionKey);
          send('sessions.messages.subscribe', { sessionKey, includeApprovals: true }).catch((err) =>
            console.warn('[openclawGatewayAdapter] subscribe failed for', sessionKey, err.message)
          );
        }
      } else {
        logUnmapped('agents.list/sessions.list row', row);
      }
    }

    // Session index changes (new/removed sessions) going forward.
    send('sessions.subscribe', {}).catch((err) =>
      console.warn('[openclawGatewayAdapter] sessions.subscribe failed:', err.message)
    );
  }

  function handleEvent(evt) {
    const { event, payload } = evt;
    switch (event) {
      case 'sessions.changed': {
        // Re-seed on any index change rather than parse the diff shape -
        // simplest thing that's correct given the payload isn't verified.
        seedAndSubscribe().catch(() => {});
        break;
      }
      case 'session.tool': {
        const name = pick(payload, ['toolName', 'name', 'tool'], 'a tool');
        const agentName = pick(payload, ['agentName', 'name'], pick(payload, ['sessionKey', 'sessionId'], 'agent'));
        onEvent({ type: 'log', kind: 'info', text: `${agentName} used ${name}` });
        const id = pick(payload, ['sessionKey', 'sessionId', 'agentId']);
        if (id) {
          onEvent({ type: 'agent_update', agent: { id: String(id), status: 'active', task: pick(payload, ['summary', 'input', 'toolName'], undefined) } });
        } else {
          logUnmapped('session.tool', payload);
        }
        break;
      }
      case 'session.operation': {
        const id = pick(payload, ['sessionKey', 'sessionId', 'agentId']);
        const status = pick(payload, ['status', 'state']);
        if (id && status) {
          onEvent({ type: 'agent_update', agent: { id: String(id), status: normalizeStatus(status) } });
        } else {
          logUnmapped('session.operation', payload);
        }
        break;
      }
      case 'session.approval': {
        const id = pick(payload, ['id', 'approvalId']);
        const title = pick(payload, ['title', 'summary'], 'Approval requested');
        const body = pick(payload, ['body', 'detail', 'description'], '');
        const agentName = pick(payload, ['agentName', 'sessionKey'], 'Agent');
        if (id) {
          onEvent({ type: 'proposal', id: String(id), title, body, agentName });
        } else {
          logUnmapped('session.approval', payload);
        }
        break;
      }
      case 'session.message':
      case 'chat': {
        const text = pick(payload, ['text', 'deltaText'], null);
        if (text) onEvent({ type: 'log', kind: 'info', text: String(text).slice(0, 200) });
        break;
      }
      default:
        logUnmapped(`event "${event}"`, payload || {});
    }
  }

  ws.on('open', () => {
    console.log('[openclawGatewayAdapter] connected to Gateway at', url);
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      // Handshake: reply with a connect request. Device-identity signing
      // (device.publicKey/signature) is part of the protocol for stronger
      // pairing modes; plain Token auth (what OpenClaw's QuickStart sets up
      // by default) is assumed not to require it here — if your gateway
      // rejects this, its auth mode is probably "trusted-proxy" or
      // "password" instead, which would need adjusting.
      const id = nextId();
      pending.set(id, {
        resolve: () => {
          seedAndSubscribe().catch((err) => console.warn('[openclawGatewayAdapter] seed failed:', err.message));
          pollTimer = setInterval(() => seedAndSubscribe().catch(() => {}), POLL_INTERVAL_MS);
        },
        reject: (err) => console.error(
          '[openclawGatewayAdapter] connect handshake rejected:',
          err.message || err,
          err.detail ? '\nfull server error detail: ' + JSON.stringify(err.detail, null, 2) : ''
        ),
      });
      ws.send(JSON.stringify({
        type: 'req',
        id,
        method: 'connect',
        params: {
          minProtocol: 4,
          maxProtocol: 4,
          // VERIFIED against packages/gateway-protocol/src/client-info.ts:
          // client.id must be one of GATEWAY_CLIENT_IDS - "gateway-client" is
          // the value that contract literally defines for this kind of
          // integration. client.mode must be one of GATEWAY_CLIENT_MODES -
          // "backend" fits a headless service best. platform is free-form.
          client: { id: 'gateway-client', version: '0.1.0', platform: 'linux', mode: 'backend' },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          auth: token ? { token } : undefined,
        },
      }));
      return;
    }

    if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) {
        resolve(msg.payload);
      } else {
        const err = new Error((msg.error && msg.error.message) || 'request failed');
        err.detail = msg.error; // full server error object, e.g. AJV-style {params:{allowedValues:[...]}}
        reject(err);
      }
      return;
    }

    if (msg.type === 'event') {
      handleEvent(msg);
    }
  });

  ws.on('error', (err) => {
    console.warn('[openclawGatewayAdapter] socket error:', err.message);
  });

  ws.on('close', () => {
    if (pollTimer) clearInterval(pollTimer);
    if (!closed) console.warn('[openclawGatewayAdapter] disconnected from Gateway, not auto-reconnecting');
  });

  async function resolveApproval({ id, kind, decision }) {
    // VERIFIED method name (approval.resolve), UNVERIFIED exact param
    // shape beyond "id, kind, decision" per the protocol doc's prose.
    return send('approval.resolve', { id, kind: kind || 'generic', decision });
  }

  function close() {
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    ws.close();
  }

  return { ws, resolveApproval, close };
}

module.exports = { connect };
