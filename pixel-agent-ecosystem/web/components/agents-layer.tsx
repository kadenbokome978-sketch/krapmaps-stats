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
  // Waypoint route for meeting gather/return: agents follow this through the
  // doorway + corridor so they never cross the empty space outside the ship.
  path?: { x: number; y: number }[]
  pathFace?: 1 | -1 // facing to hold once a gather path completes (at the seat)
}

// A seat around the control-centre table for a called meeting.
export interface MeetingSeat {
  x: number
  y: number
  face: 1 | -1 // which way to face so the agent looks toward the table
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
  keepOutsOf?: (roomId: string) => KeepOut[]
  colorOf: (roomId: string) => string
  statusColorOf: (agent: Agent) => string
  selectedAgent: string | null
  onSelectAgent: (id: string | null) => void
  // When a meeting is called, every agent walks to its seat around the hub
  // table and stays there until the meeting ends, then walks back home.
  meetingActive?: boolean
  meetingSeatOf?: (agentId: string) => MeetingSeat | null
  // The two ends of a room's corridor (hub side + room side) so meeting routes
  // follow the walkway instead of cutting across open space outside the ship.
  corridorEndsOf?: (roomId: string) => { hubEnd: { x: number; y: number }; roomEnd: { x: number; y: number } } | null
}

// Margin added to a keep-out zone's radius so a wandering agent's own
// footprint clears the art rather than just its feet-anchor point.
const AGENT_FOOTPRINT_R = 10

// True if the point clears every keep-out zone (with footprint margin).
function clearsAll(x: number, y: number, zones: KeepOut[]): boolean {
  for (const z of zones) {
    if (Math.hypot(x - z.cx, y - z.cy) < z.r + AGENT_FOOTPRINT_R) return false
  }
  return true
}

// Uniform-ish sample inside the isometric floor diamond (|u|+|v| <= 1),
// avoiding every keep-out zone. Falls back to the diamond centre if the room
// is so tightly boxed by furniture that no sample lands clear.
function sampleFloor(floor: Floor, zones: KeepOut[]): { tx: number; ty: number } {
  for (let tries = 0; tries < 32; tries++) {
    const u = Math.random() * 2 - 1
    const v = Math.random() * 2 - 1
    if (Math.abs(u) + Math.abs(v) > 1) continue // outside the diamond
    const tx = floor.cx + u * floor.halfW
    const ty = floor.cy + v * floor.halfH
    if (clearsAll(tx, ty, zones)) return { tx, ty }
  }
  return { tx: floor.cx, ty: floor.cy }
}

// Map an agent's normalized spawn (posX/posY in 0–1) into the floor diamond,
// so first-render positions land on the floor too — not just the wander
// targets. Projects any point onto/into the diamond and nudges clear of any
// keep-out zone it lands in, pushing outward from that zone's centre.
function spawnOnFloor(floor: Floor, zones: KeepOut[], posX: number, posY: number): { x: number; y: number } {
  let u = posX * 2 - 1
  let v = posY * 2 - 1
  const m = Math.abs(u) + Math.abs(v)
  if (m > 1) { u /= m; v /= m } // project onto the diamond edge
  let x = floor.cx + u * floor.halfW * 0.85
  let y = floor.cy + v * floor.halfH * 0.85
  for (const z of zones) {
    const clearR = z.r + AGENT_FOOTPRINT_R
    const d = Math.hypot(x - z.cx, y - z.cy)
    if (d < clearR && d > 0.01) {
      x = z.cx + ((x - z.cx) / d) * clearR
      y = z.cy + ((y - z.cy) / d) * clearR
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
  keepOutsOf,
  colorOf,
  statusColorOf,
  selectedAgent,
  onSelectAgent,
  meetingActive,
  meetingSeatOf,
  corridorEndsOf,
}: AgentsLayerProps) {
  // Resolve an agent's home position from the room's floor diamond when one is
  // defined, else fall back to the raw bounds rectangle (e.g. the hub).
  const homePos = (roomId: string, posX: number, posY: number): { x: number; y: number } => {
    const floor = floorOf?.(roomId) ?? null
    if (floor) return spawnOnFloor(floor, keepOutsOf?.(roomId) ?? [], posX, posY)
    const b = boundsOf(roomId)
    return { x: b.minX + posX * (b.maxX - b.minX), y: b.minY + posY * (b.maxY - b.minY) }
  }

  // Latest meeting state/seat-fn held in refs so the RAF loop reads them without
  // restarting the effect (the seat fn is a fresh closure each render).
  const meetingRef = useRef(false)
  meetingRef.current = meetingActive ?? false
  const seatFnRef = useRef(meetingSeatOf)
  seatFnRef.current = meetingSeatOf
  const endsFnRef = useRef(corridorEndsOf)
  endsFnRef.current = corridorEndsOf
  const prevMeetingRef = useRef(false)

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
      const meeting = meetingRef.current
      const MEET_SPEED = SPEED * 1.4 // gather/return a touch faster than a stroll

      // Meeting toggled → build each agent's walkway route (gather or return).
      // Routes go via the doorway + corridor so agents stay on the ship.
      if (meeting !== prevMeetingRef.current) {
        for (const a of agents) {
          const k = kin[a.id]
          if (!k) continue
          const ends = endsFnRef.current?.(a.room) ?? null
          if (meeting) {
            const seat = seatFnRef.current?.(a.id) ?? null
            const wps: { x: number; y: number }[] = []
            if (ends) wps.push(ends.roomEnd, ends.hubEnd) // out through the door, down the corridor
            if (seat) wps.push({ x: seat.x, y: seat.y })  // then to the seat in the hub
            k.path = wps
            k.pathFace = seat?.face
          } else {
            const home = homePos(a.room, a.posX, a.posY)
            const wps: { x: number; y: number }[] = []
            if (ends) wps.push(ends.hubEnd, ends.roomEnd) // back up the corridor, through the door
            wps.push({ x: home.x, y: home.y })            // then to a spot on the room floor
            k.path = wps
            k.pathFace = undefined
          }
        }
      }
      prevMeetingRef.current = meeting

      for (const a of agents) {
        let k = kin[a.id]
        const floor = floorOf?.(a.room) ?? null
        const zones = keepOutsOf?.(a.room) ?? []
        if (!k) {
          const { x, y } = homePos(a.room, a.posX, a.posY)
          k = kin[a.id] = { room: a.room, x, y, tx: x, ty: y, facing: 1, moving: false, pause: 1, trail: [] }
        }
        // If the agent was reassigned to a new room, snap into it (skip while
        // it's following a meeting route so the walk isn't interrupted).
        if (k.room !== a.room && !(k.path && k.path.length)) {
          k.room = a.room
          const { x, y } = homePos(a.room, a.posX, a.posY)
          k.x = x
          k.y = y
          k.tx = x
          k.ty = y
          k.trail = []
        }

        // ── Following a meeting route (gather or return). ──
        if (k.path && k.path.length) {
          const wp = k.path[0]
          const dx = wp.x - k.x
          const dy = wp.y - k.y
          const dist = Math.hypot(dx, dy)
          if (dist < 1.4) {
            k.path.shift()
            if (k.path.length === 0) {
              k.moving = false
              if (meeting && k.pathFace) k.facing = k.pathFace
              // Returned home: re-anchor the wander target so normal roaming
              // resumes from here rather than walking back to the seat.
              if (!meeting) { k.tx = k.x; k.ty = k.y; k.pause = 0.4 }
            }
          } else {
            k.x += (dx / dist) * MEET_SPEED * dt
            k.y += (dy / dist) * MEET_SPEED * dt
            k.moving = true
            if (Math.abs(dx) > 0.4) k.facing = dx < 0 ? -1 : 1
            k.trail.push({ x: k.x, y: k.y })
            if (k.trail.length > 12) k.trail.shift()
          }
          continue
        }

        // ── Meeting in progress, route done → hold at the seat. ──
        if (meeting) {
          k.moving = false
          const seat = seatFnRef.current?.(a.id) ?? null
          if (seat) k.facing = seat.face
          if (k.trail.length) k.trail.shift()
          continue
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
            next = sampleFloor(floor, zones)
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
