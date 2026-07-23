"use client"

import { useCallback, useRef, useState } from "react"
import type { Agent, Room } from "@/lib/agent-data"
import { ROOMS, STATUS_COLORS } from "@/lib/agent-data"
import { AgentsLayer, type Bounds } from "./agents-layer"

// ─────────────────────────────────────────────
// Layout constants — 780 × 560 viewBox
// True compass layout centred on the hub:
//              WORKSHOP (N)
//                  │
//  RESEARCH (W) ─ CONTROL ─ TREASURY (E)
//                  │
//               RADAR (S)
// ─────────────────────────────────────────────
const VW = 780
const VH = 560

const HUB = { x: 390, y: 280, r: 74 }

// Room centres on the four cardinal points.
// Boxes are near-square so the isometric interior art fills them cleanly.
const ROOM_BOXES: Record<string, { x: number; y: number; w: number; h: number }> = {
  workshop:  { x: 390, y: 94,  w: 190, h: 152 }, // North
  treasury:  { x: 648, y: 280, w: 188, h: 172 }, // East
  radar:     { x: 390, y: 466, w: 190, h: 152 }, // South
  research:  { x: 132, y: 280, w: 188, h: 172 }, // West
}

// Interior art (dense isometric pixel-art rooms) rendered inside each frame.
const ROOM_IMAGES: Record<string, string> = {
  workshop: "/rooms/workshop.png",
  treasury: "/rooms/treasury.png",
  radar: "/rooms/radar.png",
  research: "/rooms/research.png",
}
const HUB_IMAGE = "/rooms/control-centre.png"

// Corridors are straight cardinal walkways, derived from the boxes so they
// always meet the room faces. Small overlaps on both ends avoid gaps.
const WALKWAY_W = 46
const CORRIDORS: Record<string, {
  orient: "v" | "h"
  cross: number
  a: number
  b: number
}> = {
  workshop: {
    orient: "v", cross: ROOM_BOXES.workshop.x,
    a: HUB.y - HUB.r + 8,
    b: ROOM_BOXES.workshop.y + ROOM_BOXES.workshop.h / 2 - 6,
  },
  radar: {
    orient: "v", cross: ROOM_BOXES.radar.x,
    a: HUB.y + HUB.r - 8,
    b: ROOM_BOXES.radar.y - ROOM_BOXES.radar.h / 2 + 6,
  },
  treasury: {
    orient: "h", cross: ROOM_BOXES.treasury.y,
    a: HUB.x + HUB.r - 8,
    b: ROOM_BOXES.treasury.x - ROOM_BOXES.treasury.w / 2 + 6,
  },
  research: {
    orient: "h", cross: ROOM_BOXES.research.y,
    a: HUB.x - HUB.r + 8,
    b: ROOM_BOXES.research.x + ROOM_BOXES.research.w / 2 - 6,
  },
}

type RoomId = "bridge" | "workshop" | "treasury" | "radar" | "research"

// ── Agent movement geometry (shared with AgentsLayer) ──
// Inner padding keeps wandering crew clear of the label strip and edges.
const AGENT_PAD = { x: 22, top: 34, bot: 18 }

function roomInnerBounds(roomId: string): Bounds {
  const b = ROOM_BOXES[roomId]
  if (!b) {
    return { minX: HUB.x - 34, maxX: HUB.x + 34, minY: HUB.y - 22, maxY: HUB.y + 22 }
  }
  const bx = b.x - b.w / 2
  const by = b.y - b.h / 2
  return {
    minX: bx + AGENT_PAD.x,
    maxX: bx + b.w - AGENT_PAD.x,
    minY: by + AGENT_PAD.top,
    maxY: by + b.h - AGENT_PAD.bot,
  }
}

function roomColorOf(roomId: string): string {
  return ROOMS.find((r) => r.id === roomId)?.color ?? "#ffffff"
}

function statusColorOf(agent: Agent): string {
  return STATUS_COLORS[agent.status]
}

// Aggregate mood of a room from its occupants: an "error" room has any erroring
// crew (pulses red); a "quiet" room has occupants but none active (dims); an
// "active" room has at least one active agent; "empty" has no crew.
function roomMood(roomId: string, agents: Agent[]): "error" | "active" | "quiet" | "empty" {
  const here = agents.filter((a) => a.room === roomId)
  if (here.length === 0) return "empty"
  if (here.some((a) => a.status === "error")) return "error"
  if (here.some((a) => a.status === "active")) return "active"
  return "quiet"
}

// ─────────────────────────────────────────────
// Background sub-components
// ─────────────────────────────────────────────

// Deterministic PRNG (mulberry32) so the starfield renders identically on the
// server and client — avoids hydration mismatches from Math.random().
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deep-space starfield behind the whole deck — static positions (seeded) with
// gentle per-star twinkle. Purely atmospheric; sits at the very back.
function Starfield() {
  const rand = mulberry32(1337)
  const stars = Array.from({ length: 90 }, () => {
    const x = Math.round(rand() * VW * 100) / 100
    const y = Math.round(rand() * VH * 100) / 100
    const r = Math.round((0.3 + rand() * 1.1) * 100) / 100
    const base = Math.round((0.15 + rand() * 0.45) * 100) / 100
    const dur = Math.round((2 + rand() * 4) * 100) / 100
    const delay = Math.round(rand() * 4 * 100) / 100
    return { x, y, r, base, dur, delay }
  })
  return (
    <g pointerEvents="none">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#bfeaff" opacity={s.base}>
          <animate attributeName="opacity"
            values={`${s.base};${Math.min(1, s.base + 0.5)};${s.base}`}
            dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  )
}

function GridDots() {
  const dots: React.ReactNode[] = []
  const SPACING = 36
  for (let x = SPACING; x < VW; x += SPACING) {
    for (let y = SPACING; y < VH; y += SPACING) {
      const isMajor = x % (SPACING * 4) === 0 && y % (SPACING * 4) === 0
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={x} cy={y}
          r={isMajor ? 1.4 : 0.7}
          fill={isMajor ? "rgba(56,228,255,0.18)" : "rgba(56,228,255,0.09)"}
        />
      )
    }
  }
  return <g>{dots}</g>
}

// Thin diagonal cross-hatch lines behind the whole canvas for depth
function CanvasHatch() {
  const lines: React.ReactNode[] = []
  for (let i = -VH; i < VW + VH; i += 80) {
    lines.push(
      <line key={`d${i}`}
        x1={i} y1={0} x2={i + VH} y2={VH}
        stroke="rgba(56,228,255,0.022)" strokeWidth={0.5}
      />
    )
  }
  return <g>{lines}</g>
}

// Animated energy pulses flowing along a straight walkway path
function DataParticles({ path, color }: { path: string; color: string }) {
  return (
    <g>
      {[0, 0.25, 0.5, 0.75].map((offset, i) => (
        <circle key={i} r={2.6} fill={color} opacity={0.95}>
          <animateMotion dur="2.8s" begin={`${offset * 2.8}s`} repeatCount="indefinite" path={path}>
            <animate attributeName="opacity" values="0;1;1;0" dur="2.8s" repeatCount="indefinite" />
          </animateMotion>
        </circle>
      ))}
    </g>
  )
}

// ─────────────────────────────────────────────
// Inter-centre data bus — a thin circuit-trace loop that connects the four
// outer rooms directly to each other around the OUTSIDE of the layout.
// Purely decorative/background: agents never walk on it. Styled like a PCB
// trace, with glowing data packets continuously circulating the loop.
// ─────────────────────────────────────────────
const BUS_COLOR = "#5fe6ff"

// Corner anchor points that hug the outer edge of the canvas, plus the
// mid-edge tap points where each room connects to the bus.
const BUS = (() => {
  const m = 30 // margin from canvas edge
  const wk = ROOM_BOXES.workshop, tr = ROOM_BOXES.treasury
  const rd = ROOM_BOXES.radar, rs = ROOM_BOXES.research
  // Room tap points (outer face of each room, pointing away from hub)
  const taps = {
    workshop: { x: wk.x, y: wk.y - wk.h / 2 },  // top face
    treasury: { x: tr.x + tr.w / 2, y: tr.y },  // right face
    radar:    { x: rd.x, y: rd.y + rd.h / 2 },  // bottom face
    research: { x: rs.x - rs.w / 2, y: rs.y },  // left face
  }
  // Outer ring corners
  const corners = {
    tl: { x: m, y: m }, tr: { x: VW - m, y: m },
    br: { x: VW - m, y: VH - m }, bl: { x: m, y: VH - m },
  }
  return { taps, corners, m }
})()

// The full loop path: room tap → out to edge → around corners → next room.
// Rendered as one continuous polyline of right-angle (PCB) segments so a
// single packet animation can traverse the whole circuit.
function busLoopPath() {
  const { taps, corners, m } = BUS
  const P = (p: { x: number; y: number }) => `${p.x},${p.y}`
  // Workshop(top) → TL corner → BL corner → Research(left) → ... clockwise-ish.
  // Build a loop: workshop → treasury → radar → research → back to workshop,
  // routing each leg out to the nearest edge and along the perimeter.
  return [
    // start at workshop tap, go up to top edge
    `M${taps.workshop.x},${taps.workshop.y}`,
    `L${taps.workshop.x},${m}`,
    // along top edge to top-right corner, down to treasury
    `L${corners.tr.x},${corners.tr.y}`,
    `L${VW - m},${taps.treasury.y}`,
    `L${taps.treasury.x},${taps.treasury.y}`,
    // back out to right edge, down to bottom-right corner, in to radar
    `M${taps.treasury.x},${taps.treasury.y}`,
    `L${VW - m},${taps.treasury.y}`,
    `L${corners.br.x},${corners.br.y}`,
    `L${taps.radar.x},${VH - m}`,
    `L${taps.radar.x},${taps.radar.y}`,
    // radar → bottom-left corner → up to research
    `M${taps.radar.x},${taps.radar.y}`,
    `L${taps.radar.x},${VH - m}`,
    `L${corners.bl.x},${corners.bl.y}`,
    `L${m},${taps.research.y}`,
    `L${taps.research.x},${taps.research.y}`,
    // research → top-left corner → back to workshop
    `M${taps.research.x},${taps.research.y}`,
    `L${m},${taps.research.y}`,
    `L${corners.tl.x},${corners.tl.y}`,
    `L${taps.workshop.x},${m}`,
    `L${taps.workshop.x},${taps.workshop.y}`,
  ].join(" ")
}

// A single continuous perimeter path (no room stubs) used for the travelling
// packets, so they glide smoothly around the outer ring.
function busRingPath() {
  const { taps, corners, m } = BUS
  return [
    `M${taps.workshop.x},${m}`,
    `L${corners.tr.x},${corners.tr.y}`,
    `L${VW - m},${taps.treasury.y}`,   // treasury tap on right edge
    `L${corners.br.x},${corners.br.y}`,
    `L${taps.radar.x},${VH - m}`,      // radar tap on bottom edge
    `L${corners.bl.x},${corners.bl.y}`,
    `L${m},${taps.research.y}`,        // research tap on left edge
    `L${corners.tl.x},${corners.tl.y}`,
    `Z`,
  ].join(" ")
}

function DataBus() {
  const loop = busLoopPath()
  const ring = busRingPath()
  const { taps } = BUS
  const tapArr = [taps.workshop, taps.treasury, taps.radar, taps.research]
  return (
    <g>
      {/* Soft underglow for the whole trace */}
      <path d={loop} fill="none" stroke={BUS_COLOR} strokeWidth={4}
        strokeOpacity={0.06} filter="url(#blur-bridge)" />
      {/* Base trace line — thin, distinct from the thick corridors */}
      <path d={loop} fill="none" stroke={BUS_COLOR} strokeWidth={1.1}
        strokeOpacity={0.35} strokeLinejoin="round" strokeLinecap="round" />
      {/* Dashed circuit texture flowing slowly along the trace */}
      <path d={loop} fill="none" stroke={BUS_COLOR} strokeWidth={1.1}
        strokeOpacity={0.5} strokeDasharray="2 9" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="0" to="-44" dur="3.2s" repeatCount="indefinite" />
      </path>
      {/* Connection nodes / vias where the bus taps each room */}
      {tapArr.map((t, i) => (
        <g key={i}>
          <circle cx={t.x} cy={t.y} r={3.4} fill="none" stroke={BUS_COLOR} strokeWidth={1} strokeOpacity={0.55} />
          <circle cx={t.x} cy={t.y} r={1.6} fill={BUS_COLOR} opacity={0.85}>
            <animate attributeName="opacity" values="0.85;0.25;0.85" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      {/* Travelling data packets circulating the ring continuously */}
      {[0, 0.2, 0.4, 0.6, 0.8].map((offset, i) => (
        <g key={`pkt-${i}`}>
          <rect x={-2} y={-1} width={4} height={2} rx={0.6} fill={BUS_COLOR} opacity={0.95}>
            <animateMotion dur="9s" begin={`${offset * 9}s`} repeatCount="indefinite"
              rotate="auto" path={ring} />
          </rect>
          {/* trailing glow */}
          <circle r={2.6} fill={BUS_COLOR} opacity={0.35}>
            <animateMotion dur="9s" begin={`${offset * 9}s`} repeatCount="indefinite" path={ring} />
          </circle>
        </g>
      ))}
    </g>
  )
}

// ─────────────────────────────────────────────
// Corridor walkway — a real, wide walkable path
// ─────────────────────────────────────────────
function Corridor({ room, isSelected }: { room: Room; isSelected: boolean }) {
  const c = CORRIDORS[room.id]
  if (!c) return null

  const halfW = WALKWAY_W / 2
  const lo = Math.min(c.a, c.b)
  const hi = Math.max(c.a, c.b)
  const len = hi - lo

  let rx: number, ry: number, rw: number, rh: number
  let centrePath: string
  const rungs: React.ReactNode[] = []
  const RUNG_STEP = 16

  if (c.orient === "v") {
    rx = c.cross - halfW; ry = lo; rw = WALKWAY_W; rh = len
    centrePath = `M${c.cross},${c.a} L${c.cross},${c.b}`
    for (let y = lo + RUNG_STEP; y < hi - 2; y += RUNG_STEP) {
      rungs.push(
        <line key={y} x1={c.cross - halfW + 5} y1={y} x2={c.cross + halfW - 5} y2={y}
          stroke={room.color} strokeWidth={0.6} strokeOpacity={0.16} />
      )
    }
  } else {
    rx = lo; ry = c.cross - halfW; rw = len; rh = WALKWAY_W
    centrePath = `M${c.a},${c.cross} L${c.b},${c.cross}`
    for (let x = lo + RUNG_STEP; x < hi - 2; x += RUNG_STEP) {
      rungs.push(
        <line key={x} x1={x} y1={c.cross - halfW + 5} x2={x} y2={c.cross + halfW - 5}
          stroke={room.color} strokeWidth={0.6} strokeOpacity={0.16} />
      )
    }
  }

  const railOpacity = isSelected ? 0.85 : 0.5

  return (
    <g>
      {/* Outer ambient glow around the whole walkway */}
      <rect x={rx - 6} y={ry - 6} width={rw + 12} height={rh + 12} rx={8}
        fill={room.color} opacity={isSelected ? 0.10 : 0.05}
        filter={`url(#blur-${room.id})`}
      />
      {/* Walkway floor */}
      <rect x={rx} y={ry} width={rw} height={rh} rx={4}
        fill={`${room.color}12`}
        stroke={room.color} strokeWidth={0.5} strokeOpacity={0.2}
      />
      {/* Floor rungs */}
      {rungs}
      {/* Side rails — bright glowing walls along the length */}
      {c.orient === "v" ? (
        <>
          <line x1={rx} y1={ry} x2={rx} y2={ry + rh}
            stroke={room.color} strokeWidth={2} strokeOpacity={railOpacity} strokeLinecap="round" />
          <line x1={rx + rw} y1={ry} x2={rx + rw} y2={ry + rh}
            stroke={room.color} strokeWidth={2} strokeOpacity={railOpacity} strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1={rx} y1={ry} x2={rx + rw} y2={ry}
            stroke={room.color} strokeWidth={2} strokeOpacity={railOpacity} strokeLinecap="round" />
          <line x1={rx} y1={ry + rh} x2={rx + rw} y2={ry + rh}
            stroke={room.color} strokeWidth={2} strokeOpacity={railOpacity} strokeLinecap="round" />
        </>
      )}
      {/* Centre energy stream — animated flowing dashes */}
      <path d={centrePath} fill="none"
        stroke={room.color} strokeWidth={3} strokeOpacity={isSelected ? 0.9 : 0.5}
        strokeDasharray="10 8" strokeLinecap="round"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1s" repeatCount="indefinite" />
      </path>
      {/* Bright energy pulses travelling along the centre */}
      <DataParticles path={centrePath} color={room.color} />
    </g>
  )
}

// Hub decoration rings — subtle motion overlaid on the control-centre art
function HubDecos() {
  return (
    <g>
      {/* Outer halos */}
      <circle cx={HUB.x} cy={HUB.y} r={HUB.r + 18} fill="none"
        stroke="#39ff8f" strokeWidth={0.4} strokeOpacity={0.12} />
      <circle cx={HUB.x} cy={HUB.y} r={HUB.r + 10} fill="none"
        stroke="#39ff8f" strokeWidth={0.4} strokeOpacity={0.1} />
      {/* Rotating dashed ring just inside the rim */}
      <circle cx={HUB.x} cy={HUB.y} r={HUB.r - 4} fill="none"
        stroke="#39ff8f" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="7 11">
        <animateTransform attributeName="transform" type="rotate"
          from={`0 ${HUB.x} ${HUB.y}`} to={`360 ${HUB.x} ${HUB.y}`}
          dur="16s" repeatCount="indefinite" />
      </circle>
      {/* Cardinal tick marks — align with the 4 corridors */}
      {[0, 90, 180, 270].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <line key={deg}
            x1={HUB.x + Math.cos(a) * (HUB.r - 9)}
            y1={HUB.y + Math.sin(a) * (HUB.r - 9)}
            x2={HUB.x + Math.cos(a) * (HUB.r - 1)}
            y2={HUB.y + Math.sin(a) * (HUB.r - 1)}
            stroke="#39ff8f" strokeWidth={2} strokeOpacity={0.6}
          />
        )
      })}
    </g>
  )
}

// ─────────────────────────────────────────────
// Ambient room overlays — small animated effects layered on TOP of the static
// room art (never regenerating it), clipped to the room rect. Positions are in
// normalized room coords (0–1) tuned to line up with each art piece's focal
// equipment: furnace, specimen tank, vault door, radar dish/screens.
// ─────────────────────────────────────────────
function RoomAmbient({ roomId, bx, by, w, h }: {
  roomId: string; bx: number; by: number; w: number; h: number
}) {
  // helper: normalized → absolute, rounded to 2dp so server & client render
  // byte-identical strings (avoids float hydration mismatches).
  const r2 = (n: number) => Math.round(n * 100) / 100
  const X = (nx: number) => r2(bx + nx * w)
  const Y = (ny: number) => r2(by + ny * h)

  if (roomId === "workshop") {
    // Furnace sits roughly left-of-centre in the art.
    const fx = X(0.36), fy = Y(0.52)
    return (
      <g clipPath="url(#clip-workshop)" pointerEvents="none">
        {/* Flickering fire glow over the furnace mouth */}
        <ellipse cx={fx} cy={fy} rx={20} ry={16} fill="#ff9d2b" filter="url(#blur-workshop)">
          <animate attributeName="opacity" values="0.32;0.6;0.24;0.5;0.32" dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="rx" values="20;24;18;22;20" dur="0.9s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={fx} cy={fy + 2} rx={9} ry={7} fill="#ffe08a">
          <animate attributeName="opacity" values="0.7;1;0.5;0.9;0.7" dur="0.55s" repeatCount="indefinite" />
        </ellipse>
        {/* Rising embers / smoke */}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={fx + (i - 2) * 4} cy={fy} r={1.3 + (i % 2) * 0.7}
            fill={i % 2 ? "#ffb347" : "#ffd98a"}
            style={{ animation: `ember-rise ${1.6 + i * 0.35}s ${i * 0.4}s ease-out infinite` }} />
        ))}
      </g>
    )
  }

  if (roomId === "research") {
    // Specimen tank on the left; beaker shelf on the right.
    const tx = X(0.28), ty = Y(0.5)
    return (
      <g clipPath="url(#clip-research)" pointerEvents="none">
        {/* Pulsing glow of the tank liquid */}
        <ellipse cx={tx} cy={ty} rx={14} ry={22} fill="#ff4fd8" filter="url(#blur-research)">
          <animate attributeName="opacity" values="0.25;0.55;0.25" dur="2.6s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={tx} cy={ty + 6} rx={7} ry={11} fill="#ff9ee8">
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="ry" values="11;13;11" dur="2.6s" repeatCount="indefinite" />
        </ellipse>
        {/* Bubbles rising in the tank */}
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={tx - 3 + i * 3} cy={ty + 8} r={1.1 + i * 0.3} fill="#ffd0f2"
            style={{ animation: `ember-rise ${2 + i * 0.5}s ${i * 0.6}s ease-in infinite` }} />
        ))}
        {/* Gentle flicker on shelf beakers (right side) */}
        {[{ x: 0.7, y: 0.34 }, { x: 0.82, y: 0.42 }, { x: 0.75, y: 0.62 }].map((p, i) => (
          <circle key={`bk${i}`} cx={X(p.x)} cy={Y(p.y)} r={3} fill="#66ffcc">
            <animate attributeName="opacity" values="0.2;0.7;0.2" dur={`${1.4 + i * 0.4}s`}
              begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    )
  }

  if (roomId === "treasury") {
    // Vault door centred in the art.
    const vx = X(0.5), vy = Y(0.48)
    return (
      <g clipPath="url(#clip-treasury)" pointerEvents="none">
        {/* Slow pulsing energy glow on the vault door */}
        <circle cx={vx} cy={vy} r={22} fill="#b464ff" filter="url(#blur-treasury)">
          <animate attributeName="opacity" values="0.15;0.4;0.15" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="r" values="20;26;20" dur="3.4s" repeatCount="indefinite" />
        </circle>
        {/* Faintly rotating inner rings of the vault dial */}
        <g style={{ transformOrigin: `${vx}px ${vy}px` }}>
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${vx} ${vy}`} to={`360 ${vx} ${vy}`} dur="18s" repeatCount="indefinite" />
          <circle cx={vx} cy={vy} r={13} fill="none" stroke="#d9b3ff" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 5" />
          <circle cx={vx} cy={vy} r={8} fill="none" stroke="#d9b3ff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 4" />
        </g>
        {/* Counter-rotating outer ring */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from={`360 ${vx} ${vy}`} to={`0 ${vx} ${vy}`} dur="26s" repeatCount="indefinite" />
          <circle cx={vx} cy={vy} r={18} fill="none" stroke="#b464ff" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 7" />
        </g>
      </g>
    )
  }

  if (roomId === "radar") {
    // Radar dish centred; screens along the sides.
    const dx = X(0.5), dy = Y(0.5)
    return (
      <g clipPath="url(#clip-radar)" pointerEvents="none">
        {/* Intensified rotating scan sweep */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${dx} ${dy}`} to={`360 ${dx} ${dy}`} dur="3s" repeatCount="indefinite" />
          <path d={`M${dx},${dy} L${dx + 30},${dy - 10} A32,32 0 0,1 ${dx + 30},${dy + 10} Z`}
            fill="#38e4ff" opacity={0.28} />
          <line x1={dx} y1={dy} x2={dx + 32} y2={dy} stroke="#8af2ff" strokeWidth={1.4} strokeOpacity={0.9} />
        </g>
        {/* Sweep centre pulse */}
        <circle cx={dx} cy={dy} r={3} fill="#8af2ff">
          <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
        {/* Small blip pulses on side screens */}
        {[{ x: 0.16, y: 0.3 }, { x: 0.84, y: 0.34 }, { x: 0.2, y: 0.68 }, { x: 0.8, y: 0.66 }].map((p, i) => (
          <circle key={`blip${i}`} cx={X(p.x)} cy={Y(p.y)} r={2} fill="#38e4ff">
            <animate attributeName="opacity" values="0.9;0.15;0.9" dur={`${1.3 + i * 0.35}s`}
              begin={`${i * 0.25}s`} repeatCount="indefinite" />
            <animate attributeName="r" values="2;3.2;2" dur={`${1.3 + i * 0.35}s`}
              begin={`${i * 0.25}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    )
  }

  return null
}

// ─────────────────────────────────────────────
// Doorway — a lit threshold on the room's hub-facing edge where its corridor
// connects. Rendered as a bright break in the wall with a glowing doorframe
// and a soft pulsing floor-light, so each room reads as having a real entrance.
// ─────────────────────────────────────────────
function Doorway({ roomId, color }: { roomId: string; color: string }) {
  const b = ROOM_BOXES[roomId]
  if (!b) return null
  const bx = b.x - b.w / 2
  const by = b.y - b.h / 2
  // Which edge faces the hub.
  const side =
    roomId === "workshop" ? "bottom" :
    roomId === "radar"    ? "top" :
    roomId === "treasury" ? "left" :
    "right" // research
  const DW = 30 // doorway width

  // Compute the door segment endpoints + an inward glow rectangle.
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0, gx = 0, gy = 0, gw = 0, gh = 0
  if (side === "bottom") {
    x1 = b.x - DW / 2; y1 = by + b.h; x2 = b.x + DW / 2; y2 = by + b.h
    gx = b.x - DW / 2; gy = by + b.h - 10; gw = DW; gh = 12
  } else if (side === "top") {
    x1 = b.x - DW / 2; y1 = by; x2 = b.x + DW / 2; y2 = by
    gx = b.x - DW / 2; gy = by - 2; gw = DW; gh = 12
  } else if (side === "left") {
    x1 = bx; y1 = b.y - DW / 2; x2 = bx; y2 = b.y + DW / 2
    gx = bx - 2; gy = b.y - DW / 2; gw = 12; gh = DW
  } else { // right
    x1 = bx + b.w; y1 = b.y - DW / 2; x2 = bx + b.w; y2 = b.y + DW / 2
    gx = bx + b.w - 10; gy = b.y - DW / 2; gw = 12; gh = DW
  }

  return (
    <g pointerEvents="none">
      {/* Threshold floor glow spilling into the room */}
      <rect x={gx} y={gy} width={gw} height={gh} fill={color} opacity={0.22}
        clipPath={`url(#clip-${roomId})`}>
        <animate attributeName="opacity" values="0.12;0.3;0.12" dur="2.4s" repeatCount="indefinite" />
      </rect>
      {/* Bright doorway opening (covers the wall break) */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#05060a" strokeWidth={3} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeOpacity={0.9} />
      {/* Doorframe posts at each side of the opening */}
      {[{ x: x1, y: y1 }, { x: x2, y: y2 }].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.2} fill={color} stroke="#05060a" strokeWidth={0.6}>
          <animate attributeName="opacity" values="1;0.5;1" dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  )
}

// Room label strip at top of box (dot + name), on a dark backing for readability
function RoomLabel({ room, bx, by, w }: { room: Room; bx: number; by: number; w: number }) {
  return (
    <g>
      {/* Dark header band so the label reads over the art */}
      <rect x={bx + 3} y={by + 3} width={w - 6} height={18} rx={2}
        fill="#05060a" opacity={0.62} />
      <circle cx={bx + 12} cy={by + 12} r={2.8} fill={room.online ? "#39ff8f" : "#4a5570"}>
        {room.online && (
          <animate attributeName="opacity" values="1;0.25;1" dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      <text x={bx + 20} y={by + 12} dominantBaseline="middle"
        fontSize={8.5} fontFamily="monospace" letterSpacing={2}
        fill={room.color} opacity={0.95} fontWeight="bold">
        {room.name}
      </text>
    </g>
  )
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// ActivityBursts — every active room periodically emits an expanding ring +
// a packet that shoots toward the hub, so the deck feels alive with traffic.
// Deterministic timing (no random in render) → SSR-safe.
// ─────────────────────────────────────────────
function ActivityBursts({ agents }: { agents: Agent[] }) {
  const activeRooms = ROOMS.filter(
    (r) => r.id !== "bridge" && agents.some((a) => a.room === r.id && a.status === "active")
  )
  return (
    <g pointerEvents="none">
      {activeRooms.map((room, i) => {
        const b = ROOM_BOXES[room.id]
        if (!b) return null
        // Emit from the room's doorway edge toward the hub.
        const fromX = b.x
        const fromY = b.y
        return (
          <g key={`burst-${room.id}`}>
            {/* Expanding ping ring at the room centre */}
            <circle cx={fromX} cy={fromY} r={4} fill="none" stroke={room.color} strokeWidth={1.5}>
              <animate attributeName="r" values="4;26" dur="2.6s" begin={`${i * 0.65}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0" dur="2.6s" begin={`${i * 0.65}s`} repeatCount="indefinite" />
            </circle>
            {/* Data packet travelling room → hub */}
            <circle r={2} fill={room.color}>
              <animate attributeName="opacity" values="0;1;1;0" dur="2.6s" begin={`${i * 0.65}s`} repeatCount="indefinite" />
              <animateMotion dur="2.6s" begin={`${i * 0.65}s`} repeatCount="indefinite"
                path={`M${fromX},${fromY} L${HUB.x},${HUB.y}`} />
            </circle>
          </g>
        )
      })}
    </g>
  )
}

// ─────────────────────────────────────────────
// Minimap — a compact schematic of the deck in the corner, showing room
// positions (coloured, red-pulsing on error) and the current camera viewport.
// ─────────────────────────────────────────────
function Minimap({
  agents,
  cam,
  selectedRoom,
}: {
  agents: Agent[]
  cam: { scale: number; x: number; y: number }
  selectedRoom: RoomId | null
}) {
  const MW = 96
  const MH = (MW * VH) / VW
  const sx = MW / VW
  const sy = MH / VH
  // Viewport rectangle (inverse of the CSS transform, approximate).
  const vpW = MW / cam.scale
  const vpH = MH / cam.scale
  const vpX = (MW - vpW) / 2 - (cam.x * sx) / cam.scale
  const vpY = (MH - vpH) / 2 - (cam.y * sy) / cam.scale

  return (
    <div
      className="absolute bottom-3 left-3 z-20 rounded p-1"
      style={{ background: "rgba(5,6,10,0.85)", border: "1px solid rgba(56,228,255,0.25)" }}
      aria-hidden="true"
    >
      <svg width={MW} height={MH} className="block">
        <rect x={0} y={0} width={MW} height={MH} fill="#080a12" />
        {/* Hub dot */}
        <circle cx={HUB.x * sx} cy={HUB.y * sy} r={3} fill="#39ff8f" opacity={0.9} />
        {/* Rooms */}
        {ROOMS.filter((r) => r.id !== "bridge").map((room) => {
          const b = ROOM_BOXES[room.id]
          const mood = roomMood(room.id, agents)
          const isErr = mood === "error"
          return (
            <rect key={room.id}
              x={(b.x - b.w / 2) * sx} y={(b.y - b.h / 2) * sy}
              width={b.w * sx} height={b.h * sy} rx={1}
              fill={isErr ? "#ff3b47" : room.color}
              opacity={selectedRoom === room.id ? 0.9 : 0.45}
            >
              {isErr && <animate attributeName="opacity" values="0.4;0.9;0.4" dur="0.7s" repeatCount="indefinite" />}
            </rect>
          )
        })}
        {/* Camera viewport indicator */}
        {cam.scale > 1 && (
          <rect x={vpX} y={vpY} width={vpW} height={vpH} fill="none"
            stroke="#8af2ff" strokeWidth={1} strokeOpacity={0.9} />
        )}
      </svg>
    </div>
  )
}

// Main component
// ─────────────────────────────────────────────

interface CommandMapProps {
  agents: Agent[]
  selectedRoom: RoomId | null
  onSelectRoom: (id: RoomId | null) => void
  onSelectAgent: (id: string | null) => void
  selectedAgent: string | null
}

export function CommandMap({
  agents,
  selectedRoom,
  onSelectRoom,
  onSelectAgent,
  selectedAgent,
}: CommandMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const rooms = ROOMS.filter((r) => r.id !== "bridge")

  // ── Camera: scale + translate (in % of container), applied via CSS transform.
  const [cam, setCam] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false, sx: 0, sy: 0, ox: 0, oy: 0,
  })

  const clampScale = (s: number) => Math.min(3, Math.max(1, s))

  const zoomBy = useCallback((delta: number) => {
    setCam((c) => {
      const scale = clampScale(c.scale + delta)
      // Re-centre pan when fully zoomed out.
      if (scale === 1) return { scale: 1, x: 0, y: 0 }
      return { ...c, scale }
    })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 2) return
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 0.2 : -0.2)
  }, [zoomBy])

  const onPointerDown = (e: React.PointerEvent) => {
    if (cam.scale <= 1) return
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.sx
    const dy = e.clientY - drag.current.sy
    setCam((c) => ({ ...c, x: drag.current.ox + dx, y: drag.current.oy + dy }))
  }
  const onPointerUp = () => { drag.current.active = false }

  const resetCam = () => setCam({ scale: 1, x: 0, y: 0 })

  // Drama: does any room currently have an erroring agent? Drives the alarm.
  const alarm = agents.some((a) => a.status === "error")

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* CRT scanline overlay (static lines) */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />
      {/* CRT phosphor flicker — a barely-there brightness wobble */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: "rgba(56,228,255,0.015)",
          animation: "crt-flicker 5s steps(1) infinite",
        }}
      />
      {/* Screen vignette — darkens the corners like a CRT tube */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(3,4,8,0.55) 100%)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full h-full"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          background: "transparent",
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`,
          transformOrigin: "center center",
          transition: drag.current.active ? "none" : "transform 0.18s ease-out",
          cursor: cam.scale > 1 ? (drag.current.active ? "grabbing" : "grab") : "default",
          touchAction: "none",
        }}
      >
        <defs>
          {/* Per-room glow blur filters */}
          {rooms.map((room) => (
            <filter key={room.id} id={`blur-${room.id}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          ))}
          <filter id="blur-bridge" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          {/* Room clip paths (rounded rects) */}
          {rooms.map((room) => {
            const b = ROOM_BOXES[room.id]
            return (
              <clipPath key={room.id} id={`clip-${room.id}`}>
                <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} rx={3} />
              </clipPath>
            )
          })}
          {/* Hub circular clip */}
          <clipPath id="clip-bridge">
            <circle cx={HUB.x} cy={HUB.y} r={HUB.r} />
          </clipPath>
        </defs>

        {/* Canvas background layers */}
        <Starfield />
        <CanvasHatch />
        <GridDots />

        {/* ── Map frame — outer border with corner brackets ── */}
        <rect x={6} y={6} width={VW - 12} height={VH - 12}
          fill="none" stroke="rgba(56,228,255,0.07)" strokeWidth={1}
        />
        {([
          [6, 6, 20, 0, 0, 20],
          [VW - 6, 6, -20, 0, 0, 20],
          [6, VH - 6, 20, 0, 0, -20],
          [VW - 6, VH - 6, -20, 0, 0, -20],
        ] as [number, number, number, number, number, number][]).map(([x0, y0, ax, ay, bx, by], i) => (
          <polyline key={`frame-${i}`}
            points={`${x0 + ax},${y0 + ay} ${x0},${y0} ${x0 + bx},${y0 + by}`}
            fill="none" stroke="rgba(56,228,255,0.22)" strokeWidth={1.2}
          />
        ))}
        {/* Edge ruler tick marks — top */}
        {Array.from({ length: 18 }, (_, i) => 40 + i * 40).map((tx) => (
          <line key={`tick-top-${tx}`} x1={tx} y1={6} x2={tx} y2={tx % 160 === 0 ? 18 : 12}
            stroke="rgba(56,228,255,0.12)" strokeWidth={0.8} />
        ))}
        {/* Edge ruler tick marks — left */}
        {Array.from({ length: 12 }, (_, i) => 40 + i * 40).map((ty) => (
          <line key={`tick-left-${ty}`} x1={6} y1={ty} x2={ty % 160 === 0 ? 20 : 12} y2={ty}
            stroke="rgba(56,228,255,0.12)" strokeWidth={0.8} />
        ))}

        {/* ── Inter-centre data bus (background overlay, below corridors) ── */}
        <DataBus />

        {/* ── Corridors (below rooms) ── */}
        {rooms.map((room) => (
          <Corridor key={room.id} room={room} isSelected={selectedRoom === room.id} />
        ))}

        {/* ── Room boxes with isometric interior art ── */}
        {rooms.map((room) => {
          const b = ROOM_BOXES[room.id]
          const isSelected = selectedRoom === room.id
          const bx = b.x - b.w / 2
          const by = b.y - b.h / 2
          const mood = roomMood(room.id, agents)

          return (
            <g
              key={room.id}
              className="cursor-pointer"
              onClick={() => onSelectRoom(selectedRoom === room.id ? null : (room.id as RoomId))}
            >
              {/* Selection halo */}
              {isSelected && (
                <rect
                  x={bx - 5} y={by - 5} width={b.w + 10} height={b.h + 10} rx={6}
                  fill={room.color} opacity={0.06}
                />
              )}
              {/* Ambient glow behind the room */}
              <rect x={bx - 4} y={by - 4} width={b.w + 8} height={b.h + 8} rx={6}
                fill={room.color} opacity={isSelected ? 0.12 : 0.06}
                filter={`url(#blur-${room.id})`} />
              {/* Interior art image, clipped to the rounded room rect */}
              <image
                href={ROOM_IMAGES[room.id]}
                x={bx} y={by} width={b.w} height={b.h}
                clipPath={`url(#clip-${room.id})`}
                preserveAspectRatio="xMidYMid slice"
              />
              {/* Ambient animated overlays on top of the static art */}
              <RoomAmbient roomId={room.id} bx={bx} by={by} w={b.w} h={b.h} />
              {/* Mood overlay: dim quiet rooms; pulse red for error rooms */}
              {mood === "quiet" && (
                <rect x={bx} y={by} width={b.w} height={b.h} rx={3}
                  fill="#05060a" opacity={0.32} clipPath={`url(#clip-${room.id})`} pointerEvents="none" />
              )}
              {mood === "error" && (
                <rect x={bx} y={by} width={b.w} height={b.h} rx={3}
                  fill="#ff3b47" clipPath={`url(#clip-${room.id})`} pointerEvents="none">
                  <animate attributeName="opacity" values="0.08;0.26;0.08" dur="0.7s" repeatCount="indefinite" />
                </rect>
              )}
              {/* Room border (pulses red when the room has an erroring agent) */}
              <rect
                x={bx} y={by} width={b.w} height={b.h} rx={3}
                fill="none"
                stroke={mood === "error" ? "#ff3b47" : room.color}
                strokeWidth={isSelected ? 2 : 1.2}
                strokeOpacity={isSelected ? 1 : 0.6}
              >
                {mood === "error" && (
                  <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="0.7s" repeatCount="indefinite" />
                )}
              </rect>
              {/* Lit doorway on the hub-facing edge */}
              <Doorway roomId={room.id} color={room.color} />
              {/* Corner brackets */}
              {([
                [bx, by, 12, 0, 0, 12],
                [bx + b.w, by, -12, 0, 0, 12],
                [bx, by + b.h, 12, 0, 0, -12],
                [bx + b.w, by + b.h, -12, 0, 0, -12],
              ] as [number, number, number, number, number, number][]).map(
                ([x0, y0, ax, ay, bxx, byy], ci) => (
                  <polyline key={ci}
                    points={`${x0 + ax},${y0 + ay} ${x0},${y0} ${x0 + bxx},${y0 + byy}`}
                    fill="none" stroke={room.color} strokeWidth={2.2} strokeOpacity={0.9}
                  />
                )
              )}
              {/* Label row */}
              <RoomLabel room={room} bx={bx} by={by} w={b.w} />
            </g>
          )
        })}

        {/* ── Central hub (Control Centre) ── */}
        <g
          className="cursor-pointer"
          onClick={() => onSelectRoom(selectedRoom === "bridge" ? null : "bridge")}
        >
          {/* Outer ambient glow */}
          <circle cx={HUB.x} cy={HUB.y} r={HUB.r + 24}
            fill="rgba(57,255,143,0.05)"
            filter="url(#blur-bridge)"
          />
          {/* Interior art clipped to the circle */}
          <image
            href={HUB_IMAGE}
            x={HUB.x - HUB.r} y={HUB.y - HUB.r} width={HUB.r * 2} height={HUB.r * 2}
            clipPath="url(#clip-bridge)"
            preserveAspectRatio="xMidYMid slice"
          />
          {/* Hub rim */}
          <circle cx={HUB.x} cy={HUB.y} r={HUB.r}
            fill="none"
            stroke="#39ff8f"
            strokeWidth={selectedRoom === "bridge" ? 2.4 : 1.6}
            strokeOpacity={selectedRoom === "bridge" ? 1 : 0.7}
          />
          {/* Airlock ports where each corridor docks onto the hub (N/E/S/W) */}
          {([[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][]).map(([dx, dy], i) => {
            const px = HUB.x + dx * HUB.r
            const py = HUB.y + dy * HUB.r
            const angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI))
            return (
              <g key={`port-${i}`} transform={`translate(${px}, ${py}) rotate(${angle})`}>
                {/* Dark opening + bright frame */}
                <rect x={-3} y={-11} width={6} height={22} fill="#05060a" rx={1} />
                <line x1={0} y1={-11} x2={0} y2={11} stroke="#39ff8f" strokeWidth={2} strokeOpacity={0.85} />
                <circle cx={0} cy={-11} r={2} fill="#39ff8f" />
                <circle cx={0} cy={11} r={2} fill="#39ff8f" />
                {/* Docking glow */}
                <ellipse cx={6} cy={0} rx={5} ry={9} fill="#39ff8f" opacity={0.18}>
                  <animate attributeName="opacity" values="0.1;0.28;0.1" dur="2.4s"
                    begin={`${i * 0.4}s`} repeatCount="indefinite" />
                </ellipse>
              </g>
            )
          })}
          <HubDecos />
          {/* CONTROL CENTRE label — bottom, on a dark backing chip */}
          <g>
            <rect x={HUB.x - 52} y={HUB.y + HUB.r - 20} width={104} height={15} rx={3}
              fill="#05060a" opacity={0.8} stroke="#39ff8f" strokeWidth={0.5} strokeOpacity={0.4} />
            <circle cx={HUB.x - 42} cy={HUB.y + HUB.r - 12.5} r={2.4} fill="#39ff8f">
              <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x={HUB.x + 4} y={HUB.y + HUB.r - 12} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontFamily="monospace" letterSpacing={2}
              fill="#39ff8f" opacity={0.95} fontWeight="bold">
              CONTROL CENTRE
            </text>
          </g>
        </g>

        {/* ── Agent sprites (illustrated) — live wandering + trails ── */}
        <AgentsLayer
          agents={agents}
          boundsOf={roomInnerBounds}
          colorOf={roomColorOf}
          statusColorOf={statusColorOf}
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
        />

        {/* ── Drama: periodic activity bursts pinging out of active rooms ── */}
        <ActivityBursts agents={agents} />

        {/* ── Drama: red alarm scan-sweep when any room is in error ── */}
        {alarm && (
          <g pointerEvents="none">
            <rect x={0} y={0} width={VW} height={VH} fill="#ff3b47" opacity={0.04}>
              <animate attributeName="opacity" values="0.02;0.08;0.02" dur="1.4s" repeatCount="indefinite" />
            </rect>
            <rect x={0} y={0} width={VW} height={10} fill="#ff3b47" opacity={0.5}>
              <animate attributeName="y" values={`0;${VH - 10};0`} dur="4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0.2;0.5" dur="4s" repeatCount="indefinite" />
            </rect>
          </g>
        )}

        {/* ── Corner version stamps ── */}
        <text x={VW - 10} y={VH - 8} textAnchor="end" fontSize={7}
          fontFamily="monospace" fill="#1e2535" letterSpacing={1}>
          NEXUS MAP v3.0 // {VW}×{VH}
        </text>
        <text x={10} y={VH - 8} textAnchor="start" fontSize={7}
          fontFamily="monospace" fill="#1e2535" letterSpacing={1}>
          CMD-DECK // LIVE
        </text>
      </svg>

      {/* ── Alarm banner (drama) ── */}
      {alarm && (
        <div
          className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 flex items-center gap-2 rounded px-3 py-1"
          style={{
            background: "rgba(20,5,7,0.85)",
            border: "1px solid rgba(255,59,71,0.6)",
            animation: "neon-pulse 0.9s infinite",
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "#ff3b47", boxShadow: "0 0 8px #ff3b47" }}
          />
          <span
            className="font-mono text-[10px] tracking-widest font-bold"
            style={{ color: "#ff6b74" }}
          >
            ALERT — AGENT ERROR DETECTED
          </span>
        </div>
      )}

      {/* ── Zoom controls (interaction) ── */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1">
        {[
          { label: "+", fn: () => zoomBy(0.3), aria: "Zoom in" },
          { label: "−", fn: () => zoomBy(-0.3), aria: "Zoom out" },
        ].map((btn) => (
          <button
            key={btn.aria}
            type="button"
            aria-label={btn.aria}
            onClick={btn.fn}
            className="flex h-7 w-7 items-center justify-center rounded font-mono text-sm leading-none transition-colors"
            style={{
              background: "rgba(5,6,10,0.85)",
              border: "1px solid rgba(56,228,255,0.3)",
              color: "#8af2ff",
            }}
          >
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Reset view"
          onClick={resetCam}
          className="flex h-7 w-7 items-center justify-center rounded font-mono text-[9px] leading-none transition-colors"
          style={{
            background: "rgba(5,6,10,0.85)",
            border: "1px solid rgba(56,228,255,0.3)",
            color: "#8af2ff",
            opacity: cam.scale > 1 ? 1 : 0.4,
          }}
        >
          1:1
        </button>
      </div>

      {/* ── Minimap (interaction) ── */}
      <Minimap agents={agents} cam={cam} selectedRoom={selectedRoom} />
    </div>
  )
}
