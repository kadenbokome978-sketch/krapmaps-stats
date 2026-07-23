"use client"

import { useEffect, useRef, useState } from "react"
import type { Agent } from "@/lib/agent-data"
import { AgentSprite } from "./agent-sprite"

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface Kin {
  room: string
  x: number
  y: number
  tx: number
  ty: number
  facing: 1 | -1
  moving: boolean
  pause: number // seconds left standing still
  trail: { x: number; y: number }[]
}

export interface KeepOut {
  cx: number
  cy: number
  r: number
}

export interface Floor {
  cx: number
  cy: number
  halfW: number
  halfH: number
}

interface AgentsLayerProps {
  agents: Agent[]
  boundsOf: (roomId: string) => Bounds
  floorOf?: (roomId: string) => Floor | null
  keepOutOf?: (roomId: string) => KeepOut | null
  colorOf: (roomId: string) => string
  statusColorOf: (agent: Agent) => string
  selectedAgent: string | null
  onSelectAgent: (id: string | null) => void
}

// Margin added to a keep-out zone's radius so a wandering agent's own
// footprint clears the art rather than just its feet-anchor point.
const AGENT_FOOTPRINT_R = 10

// Uniform-ish sample inside the isometric floor diamond (|u|+|v| <= 1),
// avoiding the keep-out zone. Falls back to the diamond centre if the room
// is so tightly boxed by keep-out that no sample lands clear.
function sampleFloor(floor: Floor, keepOut: KeepOut | null): { tx: number; ty: number } {
  const clearR = keepOut ? keepOut.r + AGENT_FOOTPRINT_R : 0
  for (let tries = 0; tries < 24; tries++) {
    const u = Math.random() * 2 - 1
    const v = Math.random() * 2 - 1
    if (Math.abs(u) + Math.abs(v) > 1) continue // outside the diamond
    const tx = floor.cx + u * floor.halfW
    const ty = floor.cy + v * floor.halfH
    if (!keepOut || Math.hypot(tx - keepOut.cx, ty - keepOut.cy) >= clearR) {
      return { tx, ty }
    }
  }
  return { tx: floor.cx, ty: floor.cy }
}

// Map an agent's normalized spawn (posX/posY in 0–1) into the floor diamond,
// so first-render positions land on the floor too — not just the wander
// targets. Projects any point onto/into the diamond and nudges clear of the
// keep-out zone toward the diamond centre.
function spawnOnFloor(floor: Floor, keepOut: KeepOut | null, posX: number, posY: number): { x: number; y: number } {
  let u = posX * 2 - 1
  let v = posY * 2 - 1
  const m = Math.abs(u) + Math.abs(v)
  if (m > 1) { u /= m; v /= m } // project onto the diamond edge
  let x = floor.cx + u * floor.halfW * 0.85
  let y = floor.cy + v * floor.halfH * 0.85
  if (keepOut) {
    const clearR = keepOut.r + AGENT_FOOTPRINT_R
    const d = Math.hypot(x - keepOut.cx, y - keepOut.cy)
    if (d < clearR && d > 0.01) {
      x = keepOut.cx + ((x - keepOut.cx) / d) * clearR
      y = keepOut.cy + ((y - keepOut.cy) / d) * clearR
    }
  }
  return { x, y }
}

// Only these statuses actively wander; blocked crew stay put but still fidget.
function canWander(status: Agent["status"]) {
  return status === "active" || status === "idle"
}

/**
 * Renders every crew sprite and runs a lightweight requestAnimationFrame loop
 * that has each agent wander between random waypoints inside its home room,
 * pausing to idle-fidget on arrival. A short fading light-trail follows each
 * agent while it walks. Only this subtree re-renders per frame; the rest of the
 * map stays static.
 */
export function AgentsLayer({
  agents,
  boundsOf,
  floorOf,
  keepOutOf,
  colorOf,
  statusColorOf,
  selectedAgent,
  onSelectAgent,
}: AgentsLayerProps) {
  // Resolve an agent's home position from the room's floor diamond when one is
  // defined, else fall back to the raw bounds rectangle (e.g. the hub).
  const homePos = (roomId: string, posX: number, posY: number): { x: number; y: number } => {
    const floor = floorOf?.(roomId) ?? null
    if (floor) return spawnOnFloor(floor, keepOutOf?.(roomId) ?? null, posX, posY)
    const b = boundsOf(roomId)
    return { x: b.minX + posX * (b.maxX - b.minX), y: b.minY + posY * (b.maxY - b.minY) }
  }

  // Deterministic initial positions (from posX/posY) so SSR and first client
  // render match — the random wandering only kicks in after mount.
  const kinRef = useRef<Record<string, Kin> | null>(null)
  if (kinRef.current === null) {
    const init: Record<string, Kin> = {}
    for (const a of agents) {
      const { x, y } = homePos(a.room, a.posX, a.posY)
      init[a.id] = { room: a.room, x, y, tx: x, ty: y, facing: 1, moving: false, pause: 1.2, trail: [] }
    }
    kinRef.current = init
  }

  const [, force] = useState(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const SPEED = 24 // user units / second

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const kin = kinRef.current!

      for (const a of agents) {
        let k = kin[a.id]
        const floor = floorOf?.(a.room) ?? null
        const keepOut = keepOutOf?.(a.room) ?? null
        if (!k) {
          const { x, y } = homePos(a.room, a.posX, a.posY)
          k = kin[a.id] = { room: a.room, x, y, tx: x, ty: y, facing: 1, moving: false, pause: 1, trail: [] }
        }
        // If the agent was reassigned to a new room, snap into it.
        if (k.room !== a.room) {
          k.room = a.room
          const { x, y } = homePos(a.room, a.posX, a.posY)
          k.x = x
          k.y = y
          k.tx = x
          k.ty = y
          k.trail = []
        }

        if (!canWander(a.status)) {
          // Parked crew: stand still, decay any lingering trail.
          k.moving = false
          if (k.trail.length) k.trail.shift()
          continue
        }

        if (k.pause > 0) {
          k.pause -= dt
          k.moving = false
          if (k.trail.length) k.trail.shift()
          continue
        }

        const dx = k.tx - k.x
        const dy = k.ty - k.y
        const dist = Math.hypot(dx, dy)
        if (dist < 1.5) {
          // Arrived — pick a new waypoint on the floor diamond (clear of the
          // room's furniture keep-out zone, if any) and pause to fidget.
          k.pause = 0.8 + Math.random() * 2.6
          let next: { tx: number; ty: number }
          if (floor) {
            next = sampleFloor(floor, keepOut)
          } else {
            const b = boundsOf(a.room)
            next = { tx: b.minX + Math.random() * (b.maxX - b.minX), ty: b.minY + Math.random() * (b.maxY - b.minY) }
          }
          k.tx = next.tx
          k.ty = next.ty
          k.moving = false
        } else {
          const vx = (dx / dist) * SPEED * dt
          const vy = (dy / dist) * SPEED * dt
          k.x += vx
          k.y += vy
          k.moving = true
          if (Math.abs(dx) > 0.4) k.facing = dx < 0 ? -1 : 1
          k.trail.push({ x: k.x, y: k.y })
          if (k.trail.length > 12) k.trail.shift()
        }
      }

      force((v) => (v + 1) % 1000000)
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [agents, boundsOf])

  const kin = kinRef.current!

  // Back-to-front paint order (feet-y); selected agent always on top.
  const ordered = [...agents]
    .map((agent) => ({ agent, k: kin[agent.id] }))
    .filter((v) => v.k)
    .sort((a, b) => {
      const aSel = selectedAgent === a.agent.id ? 1 : 0
      const bSel = selectedAgent === b.agent.id ? 1 : 0
      if (aSel !== bSel) return aSel - bSel
      return a.k.y - b.k.y
    })

  return (
    <g>
      {/* Fading light trails (drawn under all sprites) */}
      {ordered.map(({ agent, k }) => {
        if (!k.moving || k.trail.length < 2) return null
        const color = colorOf(agent.room)
        const n = k.trail.length
        return (
          <g key={`trail-${agent.id}`} pointerEvents="none">
            {k.trail.map((p, i) => {
              const t = (i + 1) / n
              return (
                <circle key={i} cx={p.x} cy={p.y + 6}
                  r={0.8 + t * 2.6} fill={color} opacity={t * 0.28} />
              )
            })}
          </g>
        )
      })}

      {/* Crew sprites */}
      {ordered.map(({ agent, k }) => (
        <AgentSprite
          key={agent.id}
          agent={agent}
          x={k.x}
          y={k.y}
          roomColor={colorOf(agent.room)}
          statusColor={statusColorOf(agent)}
          isSelected={selectedAgent === agent.id}
          facing={k.facing}
          moving={k.moving}
          onClick={() => onSelectAgent(selectedAgent === agent.id ? null : agent.id)}
        />
      ))}
    </g>
  )
}
