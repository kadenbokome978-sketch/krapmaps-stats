"use client"

export type AgentStatus = "active" | "paused" | "error" | "idle" | "rate-limited"
export type RoomId = "bridge" | "workshop" | "treasury" | "radar" | "research"
export type LogLevel = "info" | "success" | "warn" | "error" | "system"

export interface Room {
  id: RoomId
  name: string
  color: string
  glowColor: string
  borderColor: string
  description: string
  online: boolean
}

export interface Agent {
  id: string
  name: string
  shortName: string
  room: RoomId
  status: AgentStatus
  task: string
  posX: number // 0–1 relative within room (in hub: orbit angle fraction of 2π)
  posY: number // 0–1 relative within room
  cooldownSecs?: number
  model: string
  sprite: string // path to illustrated pixel-art character sprite
}

export interface LogEntry {
  id: string
  ts: string
  level: LogLevel
  agentId: string
  agentName: string
  message: string
}

export interface Proposal {
  id: string
  agentId: string
  agentName: string
  agentRoom: RoomId
  title: string
  body: string
  ts: string
}

export interface AlertCard {
  id: string
  agentId: string
  agentName: string
  agentRoom: RoomId
  errorMsg: string
  ts: string
}

export const ROOMS: Room[] = [
  {
    id: "bridge",
    name: "CONTROL CENTRE",
    color: "#39ff8f",
    glowColor: "rgba(57,255,143,0.25)",
    borderColor: "rgba(57,255,143,0.5)",
    description: "Central hub — orchestration core",
    online: true,
  },
  {
    id: "workshop",
    name: "WORKSHOP",
    color: "#ff9d2b",
    glowColor: "rgba(255,157,43,0.25)",
    borderColor: "rgba(255,157,43,0.5)",
    description: "Code synthesis + build pipelines",
    online: true,
  },
  {
    id: "treasury",
    name: "TREASURY",
    color: "#b464ff",
    glowColor: "rgba(180,100,255,0.25)",
    borderColor: "rgba(180,100,255,0.5)",
    description: "Resource allocation + memory vaults",
    online: true,
  },
  {
    id: "radar",
    name: "RADAR",
    color: "#38e4ff",
    glowColor: "rgba(56,228,255,0.25)",
    borderColor: "rgba(56,228,255,0.5)",
    description: "Monitoring + anomaly detection",
    online: true,
  },
  {
    id: "research",
    name: "RESEARCH CENTRE",
    color: "#ff4fd8", // UV bio-luminescent magenta
    glowColor: "rgba(255,79,216,0.25)",
    borderColor: "rgba(255,79,216,0.5)",
    description: "Experimentation + model synthesis lab",
    online: true,
  },
]

// Each crew member has a HOME room they wander within. The Control Centre hub
// is intentionally unstaffed — it's the pass-through core. posX/posY are the
// starting position within the home room (0–1); live wandering takes over on
// the client. Home rooms: Workshop → Chair + Big Boy, Research → Baldy + Brizz,
// Treasury → Tree + Frap, Radar → MayoChick + Slaymal.
export const INITIAL_AGENTS: Agent[] = [
  {
    id: "a1",
    name: "MayoChick",
    shortName: "MYO",
    room: "radar",
    status: "active",
    task: "Routing task queue",
    posX: 0.32,
    posY: 0.5,
    model: "gpt-4o",
    sprite: "/agents/mayochick.png",
  },
  {
    id: "a2",
    name: "Slaymal",
    shortName: "SLY",
    room: "radar",
    status: "active",
    task: "Sync handshakes",
    posX: 0.66,
    posY: 0.58,
    model: "claude-3.7",
    sprite: "/agents/slaymal.png",
  },
  {
    id: "a3",
    name: "Chair",
    shortName: "CHR",
    room: "workshop",
    status: "paused",
    task: "Awaiting deps",
    posX: 0.3,
    posY: 0.52,
    model: "mistral-8x7b",
    sprite: "/agents/chair.png",
  },
  {
    id: "a4",
    name: "Frap",
    shortName: "FRP",
    room: "treasury",
    status: "idle",
    task: "Idle — standby",
    posX: 0.66,
    posY: 0.5,
    model: "gpt-4o-mini",
    sprite: "/agents/frap.png",
  },
  {
    id: "a5",
    name: "Tree",
    shortName: "TRE",
    room: "treasury",
    status: "paused",
    task: "Awaiting merge",
    posX: 0.32,
    posY: 0.54,
    model: "gemini-1.5",
    sprite: "/agents/tree.png",
  },
  {
    id: "a6",
    name: "Baldy",
    shortName: "BLD",
    room: "research",
    status: "active",
    task: "Analyzing telemetry",
    posX: 0.32,
    posY: 0.5,
    model: "claude-3.7",
    sprite: "/agents/baldy.png",
  },
  {
    id: "a7",
    name: "Big Boy",
    shortName: "BIG",
    room: "workshop",
    status: "error",
    task: "ERR: timeout 408",
    posX: 0.66,
    posY: 0.5,
    model: "gpt-4o",
    sprite: "/agents/bigboy.png",
  },
  {
    id: "a8",
    name: "Brizz",
    shortName: "BRZ",
    room: "research",
    status: "rate-limited",
    task: "Rate-limited — 47s",
    posX: 0.66,
    posY: 0.56,
    model: "gemini-1.5",
    cooldownSecs: 47,
    sprite: "/agents/brizz.png",
  },
]

export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: "#39ff8f",
  paused: "#ff9d2b",
  error: "#ff3355",
  idle: "#4a5570",
  "rate-limited": "#ffee33",
}

export const STATUS_LABELS: Record<AgentStatus, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  error: "ERROR",
  idle: "IDLE",
  "rate-limited": "RATE-LMT",
}

let logIdCounter = 0
const mkId = () => `log-${++logIdCounter}`
const now = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

export const INITIAL_LOGS: LogEntry[] = [
  { id: mkId(), ts: "12:00:01", level: "system", agentId: "sys", agentName: "SYS", message: "NEXUS command deck initialised — 8 agents online" },
  { id: mkId(), ts: "12:00:04", level: "success", agentId: "a1", agentName: "MayoChick", message: "Task queue hydrated — 23 jobs pending" },
  { id: mkId(), ts: "12:00:07", level: "info", agentId: "a5", agentName: "Tree", message: "Started sequencing dataset (est. 18s)" },
  { id: mkId(), ts: "12:00:10", level: "warn", agentId: "a3", agentName: "Chair", message: "Dependency lock detected — halting build" },
  { id: mkId(), ts: "12:00:15", level: "success", agentId: "a6", agentName: "Baldy", message: "Telemetry analysis pass complete" },
  { id: mkId(), ts: "12:00:18", level: "error", agentId: "a7", agentName: "Big Boy", message: "Timeout 408 — sector 4 scan aborted" },
  { id: mkId(), ts: "12:00:22", level: "warn", agentId: "a8", agentName: "Brizz", message: "Rate limit hit — cooldown 47s" },
  { id: mkId(), ts: "12:00:28", level: "info", agentId: "a2", agentName: "Slaymal", message: "Handshake OK — 3 downstream agents confirmed" },
  { id: mkId(), ts: "12:00:33", level: "info", agentId: "a4", agentName: "Frap", message: "Standby — awaiting dispatch" },
]

export const INITIAL_PROPOSALS: Proposal[] = [
  {
    id: "p1",
    agentId: "a1",
    agentName: "MayoChick",
    agentRoom: "radar",
    title: "Spawn auxiliary queue worker",
    body: "Queue depth is 23 jobs. Spawning a secondary worker (est. +40% throughput). Requires 800 token budget.",
    ts: "12:00:25",
  },
  {
    id: "p2",
    agentId: "a6",
    agentName: "Baldy",
    agentRoom: "research",
    title: "Increase memory pool ceiling",
    body: "Current memory utilisation at 88%. Propose extending pool ceiling by 512 MB for the next 30 min cycle.",
    ts: "12:00:31",
  },
]

export const INITIAL_ALERTS: AlertCard[] = [
  {
    id: "al1",
    agentId: "a7",
    agentName: "Big Boy",
    agentRoom: "workshop",
    errorMsg: "Timeout 408 — sector 4 scan aborted after 30s",
    ts: "12:00:18",
  },
]

// Live log generator
export function generateLiveLog(agents: Agent[]): LogEntry {
  const active = agents.filter((a) => a.status !== "idle")
  const agent = active[Math.floor(Math.random() * active.length)]
  const templates: Array<{ level: LogLevel; message: (a: Agent) => string }> = [
    { level: "info", message: (a) => `${a.name} heartbeat OK — task: ${a.task}` },
    { level: "success", message: (a) => `${a.name} completed subtask successfully` },
    { level: "info", message: (a) => `${a.name} requesting context window expansion` },
    { level: "warn", message: (a) => `${a.name} memory usage at 78% — monitoring` },
    { level: "info", message: (a) => `${a.name} dispatched 3 sub-calls` },
    { level: "success", message: (a) => `${a.name} synced state to vault` },
    { level: "warn", message: (a) => `${a.name} latency spike — p99 at 340ms` },
    { level: "info", message: (a) => `${a.name} tool call: search(query) → 12 results` },
  ]
  const tmpl = templates[Math.floor(Math.random() * templates.length)]
  return {
    id: mkId(),
    ts: now(),
    level: tmpl.level,
    agentId: agent.id,
    agentName: agent.name,
    message: tmpl.message(agent),
  }
}
