"use client"

import { useRef, useEffect, useState } from "react"
import type { LogEntry, Proposal, AlertCard } from "@/lib/agent-data"
import { ROOMS, STATUS_COLORS } from "@/lib/agent-data"

const LOG_COLORS = {
  info: "#8899bb",
  success: "#39ff8f",
  warn: "#ff9d2b",
  error: "#ff3355",
  system: "#38e4ff",
}

const LOG_PREFIXES = {
  info: "INF",
  success: "OK ",
  warn: "WRN",
  error: "ERR",
  system: "SYS",
}

interface Props {
  logs: LogEntry[]
  proposals: Proposal[]
  alerts: AlertCard[]
  onApproveProposal: (id: string) => void
  onRejectProposal: (id: string) => void
  onRetryAlert: (id: string) => void
  onDismissAlert: (id: string) => void
}

function LogLine({ entry, isNew }: { entry: LogEntry; isNew?: boolean }) {
  const color = LOG_COLORS[entry.level]
  const prefix = LOG_PREFIXES[entry.level]
  return (
    <div
      className="flex gap-2 items-start py-1 px-2 rounded"
      style={{
        animation: isNew ? "slide-in-up 0.3s ease-out" : "none",
        borderLeft: `2px solid ${color}`,
        background: `${color}08`,
        marginBottom: "2px",
      }}
    >
      <span className="shrink-0 font-mono text-[10px] mt-px" style={{ color }}>
        {prefix}
      </span>
      <span className="font-mono text-[9px] text-[#4a5570] shrink-0 mt-px">{entry.ts}</span>
      <span className="font-mono text-[10px] leading-relaxed" style={{ color: "#8899bb" }}>
        <span className="font-bold" style={{ color }}>{entry.agentName}</span>
        {" — "}
        {entry.message}
      </span>
    </div>
  )
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: Proposal
  onApprove: () => void
  onReject: () => void
}) {
  const room = ROOMS.find((r) => r.id === proposal.agentRoom)
  const color = room?.color || "#39ff8f"

  return (
    <div
      className="rounded p-3 mb-2"
      style={{
        background: "#0a0c14",
        border: `1px solid ${color}30`,
        boxShadow: `0 0 12px ${color}10`,
        animation: "slide-in-right 0.3s ease-out",
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="font-mono text-[9px] font-bold tracking-widest" style={{ color }}>
            PROPOSAL
          </span>
          <span className="font-mono text-[9px] text-[#4a5570]">{proposal.ts}</span>
        </div>
        <span className="font-mono text-[9px] text-[#4a5570]">
          {proposal.agentName} / {proposal.agentRoom.toUpperCase()}
        </span>
      </div>
      <div className="font-mono text-[11px] font-bold text-[#c8d0e0] mb-1">{proposal.title}</div>
      <div className="font-mono text-[10px] text-[#4a5570] leading-relaxed mb-2">{proposal.body}</div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex-1 py-1 px-2 rounded font-mono text-[10px] font-bold tracking-widest transition-all"
          style={{
            background: "rgba(57,255,143,0.12)",
            border: "1px solid rgba(57,255,143,0.4)",
            color: "#39ff8f",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(57,255,143,0.22)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(57,255,143,0.12)")}
        >
          APPROVE
        </button>
        <button
          onClick={onReject}
          className="flex-1 py-1 px-2 rounded font-mono text-[10px] font-bold tracking-widest transition-all"
          style={{
            background: "rgba(255,51,85,0.1)",
            border: "1px solid rgba(255,51,85,0.3)",
            color: "#ff3355",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,51,85,0.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,51,85,0.1)")}
        >
          REJECT
        </button>
      </div>
    </div>
  )
}

function AlertCardItem({
  alert,
  onRetry,
  onDismiss,
}: {
  alert: AlertCard
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className="rounded p-3 mb-2"
      style={{
        background: "rgba(255,51,85,0.06)",
        border: "1px solid rgba(255,51,85,0.3)",
        animation: "slide-in-right 0.3s ease-out",
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#ff3355", animation: "neon-pulse 0.5s infinite" }}
          />
          <span className="font-mono text-[9px] font-bold tracking-widest text-[#ff3355]">
            ALERT
          </span>
          <span className="font-mono text-[9px] text-[#4a5570]">{alert.ts}</span>
        </div>
        <span className="font-mono text-[9px] text-[#4a5570]">
          {alert.agentName} / {alert.agentRoom.toUpperCase()}
        </span>
      </div>
      <div className="font-mono text-[10px] text-[#ff8899] leading-relaxed mb-2">
        {alert.errorMsg}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="flex-1 py-1 px-2 rounded font-mono text-[10px] font-bold tracking-widest transition-all"
          style={{
            background: "rgba(255,157,43,0.1)",
            border: "1px solid rgba(255,157,43,0.3)",
            color: "#ff9d2b",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,157,43,0.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,157,43,0.1)")}
        >
          RETRY
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 py-1 px-2 rounded font-mono text-[10px] font-bold tracking-widest transition-all"
          style={{
            background: "rgba(74,85,112,0.15)",
            border: "1px solid rgba(74,85,112,0.3)",
            color: "#4a5570",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(74,85,112,0.25)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(74,85,112,0.15)")}
        >
          DISMISS
        </button>
      </div>
    </div>
  )
}

type Tab = "feed" | "actions"

export function ActivitySidebar({
  logs,
  proposals,
  alerts,
  onApproveProposal,
  onRejectProposal,
  onRetryAlert,
  onDismissAlert,
}: Props) {
  const feedRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>("feed")
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set())
  const prevLogsRef = useRef<LogEntry[]>(logs)

  // Auto-scroll feed
  useEffect(() => {
    if (tab === "feed" && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [logs, tab])

  // Track new entries
  useEffect(() => {
    const prev = new Set(prevLogsRef.current.map((l) => l.id))
    const newIds = logs.filter((l) => !prev.has(l.id)).map((l) => l.id)
    if (newIds.length) {
      setNewLogIds(new Set(newIds))
      const t = setTimeout(() => setNewLogIds(new Set()), 2000)
      prevLogsRef.current = logs
      return () => clearTimeout(t)
    }
    prevLogsRef.current = logs
  }, [logs])

  const actionCount = proposals.length + alerts.length

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        background: "#05060a",
        borderLeft: "1px solid rgba(56,228,255,0.1)",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(56,228,255,0.08)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38e4ff]" style={{ animation: "neon-pulse 2s infinite" }} />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#38e4ff]">
              COMMS STREAM
            </span>
          </div>
          <span className="font-mono text-[9px] text-[#4a5570]">{logs.length} events</span>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {(["feed", "actions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-1 px-2 rounded font-mono text-[10px] tracking-widest transition-all relative"
              style={{
                background: tab === t ? "rgba(56,228,255,0.12)" : "transparent",
                border: tab === t ? "1px solid rgba(56,228,255,0.35)" : "1px solid rgba(56,228,255,0.1)",
                color: tab === t ? "#38e4ff" : "#4a5570",
              }}
            >
              {t === "feed" ? "FEED" : "ACTIONS"}
              {t === "actions" && actionCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 rounded-full w-3.5 h-3.5 flex items-center justify-center font-mono text-[8px]"
                  style={{ background: "#ff3355", color: "#fff" }}
                >
                  {actionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {tab === "feed" && (
          <div ref={feedRef} className="h-full overflow-y-auto pr-1">
            {logs.map((log) => (
              <LogLine key={log.id} entry={log} isNew={newLogIds.has(log.id)} />
            ))}
            {/* Terminal cursor */}
            <div className="flex items-center gap-2 py-1 px-2">
              <span className="font-mono text-[10px] text-[#38e4ff]">{">"}</span>
              <div
                className="w-2 h-3 bg-[#38e4ff] opacity-70"
                style={{ animation: "terminal-blink 1s infinite" }}
              />
            </div>
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-0">
            {/* Proposals section */}
            {proposals.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <div className="h-px flex-1 bg-[rgba(57,255,143,0.15)]" />
                  <span className="font-mono text-[8px] tracking-[0.25em] text-[#39ff8f] opacity-70">
                    PROPOSALS ({proposals.length})
                  </span>
                  <div className="h-px flex-1 bg-[rgba(57,255,143,0.15)]" />
                </div>
                {proposals.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onApprove={() => onApproveProposal(p.id)}
                    onReject={() => onRejectProposal(p.id)}
                  />
                ))}
              </>
            )}
            {/* Alerts section */}
            {alerts.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <div className="h-px flex-1 bg-[rgba(255,51,85,0.15)]" />
                  <span className="font-mono text-[8px] tracking-[0.25em] text-[#ff3355] opacity-70">
                    ALERTS ({alerts.length})
                  </span>
                  <div className="h-px flex-1 bg-[rgba(255,51,85,0.15)]" />
                </div>
                {alerts.map((a) => (
                  <AlertCardItem
                    key={a.id}
                    alert={a}
                    onRetry={() => onRetryAlert(a.id)}
                    onDismiss={() => onDismissAlert(a.id)}
                  />
                ))}
              </>
            )}
            {actionCount === 0 && (
              <div className="flex items-center justify-center h-24">
                <span className="font-mono text-[10px] text-[#4a5570] tracking-widest">
                  NO PENDING ACTIONS
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
