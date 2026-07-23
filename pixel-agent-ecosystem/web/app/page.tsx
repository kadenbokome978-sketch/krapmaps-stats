"use client"

import { useState, useEffect, useCallback } from "react"
import {
  INITIAL_AGENTS,
  INITIAL_LOGS,
  INITIAL_PROPOSALS,
  INITIAL_ALERTS,
  generateLiveLog,
  ROOMS,
  STATUS_COLORS,
  type Agent,
  type LogEntry,
  type Proposal,
  type AlertCard,
  type RoomId,
} from "@/lib/agent-data"
import { CommandMap } from "@/components/command-map"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { RosterBar } from "@/components/roster-bar"
import { useRelay, type RelayStatus } from "@/lib/relay"

// ── Topbar ──────────────────────────────────────────────────────
function Topbar({
  selectedRoom,
  agentCount,
  errorCount,
  mode,
  relayStatus,
  relayUrl,
  onRelayUrlChange,
  onEnterLive,
  onEnterDemo,
}: {
  selectedRoom: RoomId | null
  agentCount: number
  errorCount: number
  mode: "demo" | "live"
  relayStatus: RelayStatus
  relayUrl: string
  onRelayUrlChange: (url: string) => void
  onEnterLive: () => void
  onEnterDemo: () => void
}) {
  const [time, setTime] = useState("")
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      )
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  const room = selectedRoom ? ROOMS.find((r) => r.id === selectedRoom) : null

  return (
    <header
      className="flex items-center px-4 h-10 shrink-0 gap-4"
      style={{
        background: "#030408",
        borderBottom: "1px solid rgba(56,228,255,0.1)",
      }}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1 rounded-sm"
              style={{
                height: `${8 + i * 4}px`,
                background: "#39ff8f",
                opacity: 0.6 + i * 0.2,
                animation: `neon-pulse ${1.5 + i * 0.3}s ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-[#39ff8f]">
          NEXUS
        </span>
        <span className="font-mono text-[10px] tracking-[0.15em] text-[#4a5570]">
          // COMMAND DECK
        </span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-[rgba(255,255,255,0.06)]" />

      {/* Selected room indicator */}
      <div className="flex items-center gap-2 min-w-[120px]">
        {room ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: room.color }} />
            <span className="font-mono text-[10px] tracking-widest" style={{ color: room.color }}>
              {room.name}
            </span>
            <span className="font-mono text-[9px] text-[#4a5570]">selected</span>
          </>
        ) : (
          <span className="font-mono text-[10px] tracking-widest text-[#4a5570]">
            no selection
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status pills */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full bg-[#39ff8f]"
            style={{ animation: "neon-pulse 2s infinite" }}
          />
          <span className="font-mono text-[10px] text-[#39ff8f]">{agentCount} AGENTS</span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full bg-[#ff3355]"
              style={{ animation: "neon-pulse 0.5s infinite" }}
            />
            <span className="font-mono text-[10px] text-[#ff3355]">{errorCount} ERR</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#38e4ff]" />
          <span className="font-mono text-[10px] text-[#4a5570]">{time}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-[rgba(255,255,255,0.06)]" />

      {/* Live / Demo relay controls */}
      <div className="flex items-center gap-2 shrink-0">
        {mode === "live" && (
          <input
            value={relayUrl}
            onChange={(e) => onRelayUrlChange(e.target.value)}
            spellCheck={false}
            className="font-mono text-[9px] px-1.5 py-0.5 rounded outline-none w-[150px]"
            style={{
              background: "rgba(10,12,20,0.8)",
              border: "1px solid rgba(56,228,255,0.2)",
              color: "#8899bb",
            }}
          />
        )}
        <button
          onClick={() => (mode === "demo" ? onEnterLive() : onEnterDemo())}
          className="font-mono text-[9px] tracking-widest px-2 py-1 rounded transition-all"
          style={{
            background:
              relayStatus === "live" ? "rgba(57,255,143,0.15)" :
              relayStatus === "error" || relayStatus === "closed" ? "rgba(255,51,85,0.12)" :
              relayStatus === "connecting" ? "rgba(255,157,43,0.12)" :
              "rgba(74,85,112,0.15)",
            border: `1px solid ${
              relayStatus === "live" ? "#39ff8f" :
              relayStatus === "error" || relayStatus === "closed" ? "#ff3355" :
              relayStatus === "connecting" ? "#ff9d2b" :
              "rgba(74,85,112,0.4)"
            }`,
            color:
              relayStatus === "live" ? "#39ff8f" :
              relayStatus === "error" || relayStatus === "closed" ? "#ff3355" :
              relayStatus === "connecting" ? "#ff9d2b" :
              "#4a5570",
          }}
        >
          {relayStatus === "live" ? "● LIVE" :
           relayStatus === "connecting" ? "CONNECTING…" :
           relayStatus === "error" ? "ERROR — RETRY" :
           relayStatus === "closed" ? "DISCONNECTED" :
           "DEMO MODE"}
        </button>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-[rgba(255,255,255,0.06)]" />

      {/* Sys status */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[9px] tracking-widest text-[#4a5570]">SYS</span>
        <span
          className="font-mono text-[9px] tracking-widest text-[#39ff8f]"
          style={{ animation: "flicker 8s 3s infinite" }}
        >
          ONLINE
        </span>
      </div>
    </header>
  )
}

// ── Main dashboard ───────────────────────────────────────────────
export default function Page() {
  // Demo-mode state - untouched from the original mock data flow.
  const [demoAgents, setDemoAgents] = useState<Agent[]>(INITIAL_AGENTS)
  const [demoLogs, setDemoLogs] = useState<LogEntry[]>(INITIAL_LOGS)
  const [demoProposals, setDemoProposals] = useState<Proposal[]>(INITIAL_PROPOSALS)
  const [demoAlerts, setDemoAlerts] = useState<AlertCard[]>(INITIAL_ALERTS)
  const [selectedRoom, setSelectedRoom] = useState<RoomId | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const relay = useRelay()
  const isLive = relay.mode === "live"

  // Whichever source is active drives everything below - components never
  // know whether they're looking at demo or live data.
  const agents = isLive ? relay.agents : demoAgents
  const logs = isLive ? relay.logs : demoLogs
  const proposals = isLive ? relay.proposals : demoProposals
  const alerts = isLive ? relay.alerts : demoAlerts

  const errorCount = agents.filter((a) => a.status === "error").length

  // Live log ticker - demo mode only. In live mode, log entries come from
  // the relay's own "log" events instead.
  useEffect(() => {
    if (isLive) return
    const iv = setInterval(() => {
      setDemoLogs((prev) => {
        const next = [...prev, generateLiveLog(demoAgents)]
        return next.length > 120 ? next.slice(-100) : next
      })
    }, 2200)
    return () => clearInterval(iv)
  }, [isLive, demoAgents])

  // In live mode, operator actions are sent to the relay and the resulting
  // state change (proposal/alert removed, agent status updated) arrives back
  // as a "resolved" / "agent_update" event rather than being applied here -
  // that keeps the UI honest about what the backend actually did.
  const handleApproveProposal = useCallback((id: string) => {
    if (isLive) { relay.sendOperatorAction(id, "approved"); return }
    const p = demoProposals.find((x) => x.id === id)
    if (p) {
      setDemoLogs((prev) => [
        ...prev,
        {
          id: `log-ap-${id}`,
          ts: new Date().toTimeString().slice(0, 8),
          level: "success",
          agentId: p.agentId,
          agentName: p.agentName,
          message: `Proposal approved: "${p.title}"`,
        },
      ])
    }
    setDemoProposals((prev) => prev.filter((x) => x.id !== id))
  }, [isLive, relay, demoProposals])

  const handleRejectProposal = useCallback((id: string) => {
    if (isLive) { relay.sendOperatorAction(id, "rejected"); return }
    const p = demoProposals.find((x) => x.id === id)
    if (p) {
      setDemoLogs((prev) => [
        ...prev,
        {
          id: `log-rj-${id}`,
          ts: new Date().toTimeString().slice(0, 8),
          level: "warn",
          agentId: p.agentId,
          agentName: p.agentName,
          message: `Proposal rejected: "${p.title}"`,
        },
      ])
    }
    setDemoProposals((prev) => prev.filter((x) => x.id !== id))
  }, [isLive, relay, demoProposals])

  const handleRetryAlert = useCallback((id: string) => {
    if (isLive) { relay.sendOperatorAction(id, "retry"); return }
    const a = demoAlerts.find((x) => x.id === id)
    if (a) {
      setDemoAgents((prev) =>
        prev.map((ag) =>
          ag.id === a.agentId ? { ...ag, status: "active", task: "Retrying…" } : ag
        )
      )
      setDemoLogs((prev) => [
        ...prev,
        {
          id: `log-rt-${id}`,
          ts: new Date().toTimeString().slice(0, 8),
          level: "info",
          agentId: a.agentId,
          agentName: a.agentName,
          message: `Retry initiated for: ${a.errorMsg}`,
        },
      ])
    }
    setDemoAlerts((prev) => prev.filter((x) => x.id !== id))
  }, [isLive, relay, demoAlerts])

  const handleDismissAlert = useCallback((id: string) => {
    if (isLive) { relay.sendOperatorAction(id, "terminate"); return }
    setDemoAlerts((prev) => prev.filter((x) => x.id !== id))
  }, [isLive, relay])

  return (
    <main
      className="flex flex-col"
      style={{ height: "100dvh", background: "#05060a", overflow: "hidden" }}
    >
      {/* Top bar */}
      <Topbar
        selectedRoom={selectedRoom}
        agentCount={agents.length}
        errorCount={errorCount}
        mode={relay.mode}
        relayStatus={relay.status}
        relayUrl={relay.relayUrl}
        onRelayUrlChange={relay.setRelayUrl}
        onEnterLive={relay.enterLive}
        onEnterDemo={relay.enterDemo}
      />

      {/* Main body: map + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Map canvas */}
        <div
          className="flex-1 min-w-0 min-h-0 relative overflow-hidden"
          style={{ background: "#05060a" }}
        >
          {/* Subtle radial vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              background: "radial-gradient(ellipse 70% 60% at 48% 48%, transparent 30%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            <CommandMap
              agents={agents}
              selectedRoom={selectedRoom}
              onSelectRoom={setSelectedRoom}
              selectedAgent={selectedAgent}
              onSelectAgent={setSelectedAgent}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div
          className="w-[300px] shrink-0 flex flex-col min-h-0"
          style={{ borderLeft: "1px solid rgba(56,228,255,0.08)" }}
        >
          <ActivitySidebar
            logs={logs}
            proposals={proposals}
            alerts={alerts}
            onApproveProposal={handleApproveProposal}
            onRejectProposal={handleRejectProposal}
            onRetryAlert={handleRetryAlert}
            onDismissAlert={handleDismissAlert}
          />
        </div>
      </div>

      {/* Bottom roster bar */}
      <div
        className="shrink-0 h-[72px]"
        style={{
          background: "#030408",
          borderTop: "1px solid rgba(56,228,255,0.08)",
        }}
      >
        <RosterBar
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
        />
      </div>
    </main>
  )
}
