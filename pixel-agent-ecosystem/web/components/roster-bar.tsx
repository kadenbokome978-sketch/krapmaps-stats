"use client"

import { useEffect, useState } from "react"
import type { Agent } from "@/lib/agent-data"
import { ROOMS, STATUS_COLORS, STATUS_LABELS } from "@/lib/agent-data"

interface RosterBarProps {
  agents: Agent[]
  selectedAgent: string | null
  onSelectAgent: (id: string | null) => void
}

function Countdown({ secs }: { secs: number }) {
  const [remaining, setRemaining] = useState(secs)
  useEffect(() => {
    if (remaining <= 0) return
    const iv = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(iv)
  }, [])
  return (
    <span className="font-mono text-[9px]" style={{ color: "#ffee33" }}>
      {remaining > 0 ? `${remaining}s` : "READY"}
    </span>
  )
}

function AgentChip({
  agent,
  isSelected,
  onClick,
}: {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}) {
  const room = ROOMS.find((r) => r.id === agent.room)
  const statusColor = STATUS_COLORS[agent.status]
  const roomColor = room?.color || "#fff"

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded transition-all shrink-0 relative"
      style={{
        background: isSelected ? `${roomColor}15` : "rgba(10,12,20,0.8)",
        border: `1px solid ${isSelected ? roomColor : "rgba(255,255,255,0.06)"}`,
        boxShadow: isSelected ? `0 0 10px ${roomColor}25` : "none",
        minWidth: "116px",
      }}
    >
      {/* Room color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
        style={{ background: roomColor }}
      />

      {/* Status dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: statusColor,
          boxShadow: `0 0 4px ${statusColor}`,
          animation: agent.status === "active" ? "neon-pulse 2s infinite" :
                     agent.status === "error" ? "neon-pulse 0.4s infinite" : "none",
        }}
      />

      {/* Name + task */}
      <div className="flex flex-col items-start min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[11px] font-bold tracking-wide shrink-0"
            style={{ color: isSelected ? roomColor : "#c8d0e0" }}
          >
            {agent.shortName}
          </span>
          <span
            className="font-mono text-[8px] tracking-widest px-1 rounded"
            style={{
              background: `${statusColor}15`,
              border: `1px solid ${statusColor}30`,
              color: statusColor,
            }}
          >
            {STATUS_LABELS[agent.status]}
          </span>
        </div>
        <span
          className="font-mono text-[9px] truncate max-w-[80px]"
          style={{ color: "#4a5570" }}
          title={agent.task}
        >
          {agent.task}
        </span>
        {agent.status === "rate-limited" && agent.cooldownSecs !== undefined && (
          <Countdown secs={agent.cooldownSecs} />
        )}
      </div>
    </button>
  )
}

export function RosterBar({ agents, selectedAgent, onSelectAgent }: RosterBarProps) {
  // Stats
  const activeCount = agents.filter((a) => a.status === "active").length
  const errorCount = agents.filter((a) => a.status === "error").length
  const pausedCount = agents.filter((a) => a.status === "paused").length
  const rateLimitedCount = agents.filter((a) => a.status === "rate-limited").length

  return (
    <div
      className="flex items-stretch h-full px-3 gap-3"
      style={{ borderTop: "1px solid rgba(56,228,255,0.08)" }}
    >
      {/* Left stats */}
      <div
        className="flex flex-col justify-center gap-0.5 pr-3 shrink-0"
        style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="font-mono text-[8px] tracking-[0.2em] text-[#4a5570] mb-1">ROSTER</div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39ff8f]" />
          <span className="font-mono text-[10px] text-[#39ff8f]">{activeCount} active</span>
        </div>
        {pausedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ff9d2b]" />
            <span className="font-mono text-[10px] text-[#ff9d2b]">{pausedCount} paused</span>
          </div>
        )}
        {errorCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ff3355]" style={{ animation: "neon-pulse 0.4s infinite" }} />
            <span className="font-mono text-[10px] text-[#ff3355]">{errorCount} error</span>
          </div>
        )}
        {rateLimitedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ffee33]" />
            <span className="font-mono text-[10px] text-[#ffee33]">{rateLimitedCount} rate-ltd</span>
          </div>
        )}
      </div>

      {/* Agent chips */}
      <div className="flex items-center gap-2 overflow-x-auto py-1.5 flex-1 min-w-0">
        {agents.map((agent) => (
          <AgentChip
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent === agent.id}
            onClick={() => onSelectAgent(selectedAgent === agent.id ? null : agent.id)}
          />
        ))}
      </div>

      {/* Right system status (hidden on mobile — duplicates the top bar) */}
      <div
        className="hidden md:flex flex-col justify-center gap-0.5 pl-3 shrink-0"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="font-mono text-[8px] tracking-[0.2em] text-[#4a5570] mb-1">SYSTEM</div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39ff8f]" style={{ animation: "neon-pulse 2s infinite" }} />
          <span className="font-mono text-[10px] text-[#39ff8f]">SYS ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#38e4ff" }} />
          <span className="font-mono text-[10px] text-[#4a5570]">4 rooms active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-[#4a5570]">NEXUS v2.4.1</span>
        </div>
      </div>
    </div>
  )
}
