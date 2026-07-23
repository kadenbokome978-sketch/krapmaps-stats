"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Agent, AgentStatus, AlertCard, LogEntry, LogLevel, Proposal, RoomId } from "./agent-data"

export type RelayMode = "demo" | "live"
export type RelayStatus = "demo" | "connecting" | "live" | "error" | "closed"

// The 8 illustrated character sprites we actually have art for. Agents coming
// from a real backend won't map to one of our named crew members, so we
// deterministically reuse one of these per agent id (hash-based) rather than
// falling back to a generic/unstyled sprite.
const SPRITE_POOL = [
  "/agents/mayochick.png",
  "/agents/slaymal.png",
  "/agents/chair.png",
  "/agents/frap.png",
  "/agents/tree.png",
  "/agents/baldy.png",
  "/agents/bigboy.png",
  "/agents/brizz.png",
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function spriteForId(id: string): string {
  return SPRITE_POOL[hashStr(id) % SPRITE_POOL.length]
}

function shortNameOf(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "AGT"
}

const VALID_ROOMS: RoomId[] = ["bridge", "workshop", "treasury", "radar", "research"]
function normalizeRoom(room: unknown): RoomId {
  return VALID_ROOMS.includes(room as RoomId) ? (room as RoomId) : "bridge"
}

const VALID_STATUSES: AgentStatus[] = ["active", "paused", "error", "idle", "rate-limited"]
function normalizeStatus(status: unknown, timer?: number): AgentStatus {
  // The relay's canonical schema doesn't have a distinct "rate-limited"
  // status - it uses "paused" + a timer. Map that combination to
  // rate-limited here so the roster countdown chip renders correctly.
  if (status === "paused" && typeof timer === "number" && timer > 0) return "rate-limited"
  return VALID_STATUSES.includes(status as AgentStatus) ? (status as AgentStatus) : "active"
}

function nowTs(): string {
  return new Date().toTimeString().slice(0, 8)
}

interface RelayAgentUpdate {
  id: string
  name?: string
  room?: string
  status?: string
  task?: string
  timer?: number
}

type RelayEvent =
  | { type: "snapshot"; agents: RelayAgentUpdate[] }
  | { type: "agent_update"; agent?: RelayAgentUpdate; id?: string; name?: string; room?: string; status?: string; task?: string; timer?: number }
  | { type: "log"; kind?: LogLevel; text?: string }
  | { type: "proposal"; id: string; title?: string; body?: string; agentName?: string; agentId?: string }
  | { type: "error_alert"; id: string; agentId?: string; agentName?: string; title?: string; body?: string }
  | { type: "resolved"; id: string; outcome?: string }

interface UseRelayResult {
  mode: RelayMode
  status: RelayStatus
  relayUrl: string
  setRelayUrl: (url: string) => void
  agents: Agent[]
  logs: LogEntry[]
  proposals: Proposal[]
  alerts: AlertCard[]
  enterLive: () => void
  enterDemo: () => void
  sendOperatorAction: (id: string, action: string) => void
}

let logIdSeq = 0
const mkLogId = () => `relay-log-${Date.now()}-${++logIdSeq}`

export function useRelay(): UseRelayResult {
  const [mode, setMode] = useState<RelayMode>("demo")
  const [status, setStatus] = useState<RelayStatus>("demo")
  const [relayUrl, setRelayUrl] = useState("ws://localhost:8787/live")

  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [alerts, setAlerts] = useState<AlertCard[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const agentsRef = useRef<Agent[]>([])
  agentsRef.current = agents

  const appendLog = useCallback((level: LogLevel, agentName: string, message: string, agentId = "sys") => {
    setLogs((prev) => {
      const next = [...prev, { id: mkLogId(), ts: nowTs(), level, agentId, agentName, message }]
      return next.length > 150 ? next.slice(-120) : next
    })
  }, [])

  const upsertAgent = useCallback((data: RelayAgentUpdate) => {
    if (!data?.id) return
    setAgents((prev) => {
      const idx = prev.findIndex((a) => a.id === data.id)
      if (idx === -1) {
        const room = normalizeRoom(data.room)
        const created: Agent = {
          id: data.id,
          name: data.name || data.id,
          shortName: shortNameOf(data.name || data.id),
          room,
          status: normalizeStatus(data.status, data.timer),
          task: data.task || "",
          posX: 0.3 + Math.random() * 0.4,
          posY: 0.3 + Math.random() * 0.4,
          model: "external",
          sprite: spriteForId(data.id),
          ...(typeof data.timer === "number" ? { cooldownSecs: data.timer } : {}),
        }
        return [...prev, created]
      }
      const next = [...prev]
      const existing = next[idx]
      next[idx] = {
        ...existing,
        name: data.name ?? existing.name,
        shortName: data.name ? shortNameOf(data.name) : existing.shortName,
        room: data.room ? normalizeRoom(data.room) : existing.room,
        status: data.status ? normalizeStatus(data.status, data.timer) : existing.status,
        task: typeof data.task === "string" ? data.task : existing.task,
        cooldownSecs: typeof data.timer === "number" ? data.timer : existing.cooldownSecs,
      }
      return next
    })
  }, [])

  const handleEvent = useCallback((evt: RelayEvent) => {
    switch (evt.type) {
      case "snapshot": {
        setAgents([])
        setProposals([])
        setAlerts([])
        ;(evt.agents || []).forEach(upsertAgent)
        appendLog("system", "SYS", `Snapshot received — ${(evt.agents || []).length} agents online.`)
        break
      }
      case "agent_update": {
        upsertAgent(evt.agent || (evt as unknown as RelayAgentUpdate))
        break
      }
      case "log": {
        appendLog((evt.kind as LogLevel) || "info", "RELAY", evt.text || "", "relay")
        break
      }
      case "proposal": {
        const agent = agentsRef.current.find((a) => a.name === evt.agentName || a.id === evt.agentId)
        setProposals((prev) => [
          ...prev,
          {
            id: evt.id,
            agentId: agent?.id || evt.agentId || "unknown",
            agentName: evt.agentName || agent?.name || "Agent",
            agentRoom: agent?.room || "bridge",
            title: evt.title || "New proposal",
            body: evt.body || "",
            ts: nowTs(),
          },
        ])
        break
      }
      case "error_alert": {
        const agent = agentsRef.current.find((a) => a.id === evt.agentId || a.name === evt.agentName)
        setAlerts((prev) => [
          ...prev,
          {
            id: evt.id,
            agentId: agent?.id || evt.agentId || "unknown",
            agentName: evt.agentName || agent?.name || "Agent",
            agentRoom: agent?.room || "bridge",
            errorMsg: evt.body ? `${evt.title ? evt.title + " — " : ""}${evt.body}` : evt.title || "Error",
            ts: nowTs(),
          },
        ])
        if (agent) {
          setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, status: "error" } : a)))
        }
        break
      }
      case "resolved": {
        setProposals((prev) => prev.filter((p) => p.id !== evt.id))
        setAlerts((prev) => prev.filter((a) => a.id !== evt.id))
        break
      }
    }
  }, [appendLog, upsertAgent])

  const connect = useCallback((url: string) => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    setStatus("connecting")
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      setStatus("error")
      return
    }
    wsRef.current = ws
    ws.onopen = () => {
      setStatus("live")
      appendLog("system", "SYS", `Connected to relay at ${url}`)
    }
    ws.onmessage = (ev) => {
      try {
        handleEvent(JSON.parse(ev.data))
      } catch {
        // ignore malformed message
      }
    }
    ws.onerror = () => setStatus("error")
    ws.onclose = () => {
      setStatus((s) => (s === "live" || s === "connecting" ? "closed" : s))
    }
  }, [appendLog, handleEvent])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const enterLive = useCallback(() => {
    setMode("live")
    connect(relayUrl)
  }, [connect, relayUrl])

  const enterDemo = useCallback(() => {
    setMode("demo")
    setStatus("demo")
    disconnect()
    setAgents([])
    setLogs([])
    setProposals([])
    setAlerts([])
  }, [disconnect])

  const sendOperatorAction = useCallback((id: string, action: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "operator_action", id, action }))
      return
    }
    const httpBase = relayUrl.replace(/^ws/, "http").replace(/\/live\/?$/, "")
    fetch(`${httpBase}/operator-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => appendLog("warn", "SYS", "Failed to reach relay with operator action."))
  }, [relayUrl, appendLog])

  useEffect(() => () => disconnect(), [disconnect])

  return {
    mode,
    status,
    relayUrl,
    setRelayUrl,
    agents,
    logs,
    proposals,
    alerts,
    enterLive,
    enterDemo,
    sendOperatorAction,
  }
}
