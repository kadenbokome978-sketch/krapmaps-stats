"use client"

import type { Agent } from "@/lib/agent-data"

interface AgentSpriteProps {
  agent: Agent
  x: number
  y: number
  roomColor: string
  statusColor: string
  isSelected: boolean
  onClick: () => void
  /** 1 = facing right, -1 = facing left (flips the sprite horizontally). */
  facing?: 1 | -1
  /** Whether the agent is currently walking (vs standing still). */
  moving?: boolean
}

/**
 * Small room-appropriate "busy" glyph shown above a standing agent so each
 * crew member performs a role-specific idle action matching their room's work.
 * Drawn with tiny vector shapes only (no text / no emoji).
 */
function RoleAction({ roomId, color }: { roomId: Agent["room"]; color: string }) {
  // Positioned just above the sprite's head, to the side.
  const gx = 11
  const gy = -12
  if (roomId === "workshop") {
    // Hammering sparks
    return (
      <g transform={`translate(${gx}, ${gy})`}>
        <path d="M0,-3 L0.9,-0.9 L3,0 L0.9,0.9 L0,3 L-0.9,0.9 L-3,0 L-0.9,-0.9 Z"
          fill="#ffd98a">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="0.5s" repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="scale" values="0.6;1.2;0.6" dur="0.5s" repeatCount="indefinite" additive="sum" />
        </path>
        <circle cx={2.6} cy={-2.4} r={0.7} fill="#ff9d2b">
          <animate attributeName="opacity" values="0;1;0" dur="0.5s" begin="0.15s" repeatCount="indefinite" />
        </circle>
      </g>
    )
  }
  if (roomId === "treasury") {
    // Flipping coin
    return (
      <g transform={`translate(${gx}, ${gy})`}>
        <ellipse cx={0} cy={0} rx={2.6} ry={2.6} fill={color} opacity={0.85}>
          <animate attributeName="rx" values="2.6;0.5;2.6" dur="1.1s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={0} cy={0} rx={1.2} ry={1.2} fill="#f0dcff">
          <animate attributeName="rx" values="1.2;0.2;1.2" dur="1.1s" repeatCount="indefinite" />
        </ellipse>
      </g>
    )
  }
  if (roomId === "research") {
    // Typing / data-entry dots
    return (
      <g transform={`translate(${gx - 3}, ${gy})`}>
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={i * 2.6} cy={0} r={1} fill={color}>
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1s"
              begin={`${i * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    )
  }
  if (roomId === "radar") {
    // Scanning ping
    return (
      <g transform={`translate(${gx}, ${gy})`}>
        <circle cx={0} cy={0} r={1.4} fill={color} />
        <circle cx={0} cy={0} r={1.4} fill="none" stroke={color} strokeWidth={0.6}>
          <animate attributeName="r" values="1.4;4;1.4" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.9;0;0.9" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </g>
    )
  }
  return null
}

/**
 * Illustrated pixel-art character sprite (raster image) with the colored
 * status ring/glow mechanic layered around its base. Rendered inside the
 * parent <svg>, so all coordinates are relative to (x, y).
 *   green = active · orange = paused · red = error · gray = idle · yellow = rate-limited
 */
export function AgentSprite({
  agent,
  x,
  y,
  roomColor,
  statusColor,
  isSelected,
  onClick,
  facing = 1,
  moving = false,
}: AgentSpriteProps) {
  const isError       = agent.status === "error"
  const isPaused      = agent.status === "paused"
  const isRateLimited = agent.status === "rate-limited"
  const isActive      = agent.status === "active"
  const isIdle        = agent.status === "idle"

  const dimmed = isPaused || isRateLimited || isIdle

  // Sprite footprint
  const IMG = 34
  // Walking bounce while moving; gentle sway while standing still.
  const bob = moving
    ? "sprite-walk 0.5s ease-in-out infinite"
    : "idle-sway 2.8s ease-in-out infinite"

  // Standing crew perform a room-specific idle action (not while erroring).
  const showAction = !moving && !isError

  // Name tag: capped length so the tag can never grow past what the room
  // padding accounts for (see AGENT_PAD in command-map.tsx).
  const MAX_NAME = 12
  const displayName =
    agent.name.length > MAX_NAME ? agent.name.slice(0, MAX_NAME - 1) + "…" : agent.name
  const nameW = Math.max(30, displayName.length * 4.2 + 12)

  // Round positions so server/client render byte-identical SVG (no float drift).
  const tx = Math.round(x * 100) / 100
  const ty = Math.round(y * 100) / 100

  return (
    <g
      transform={`translate(${tx}, ${ty})`}
      className="cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      role="button"
      aria-label={`Agent ${agent.name} — ${agent.status}`}
    >
      {/* ── Base status glow disc (the ring/glow mechanic) ── */}
      <ellipse cx={0} cy={11} rx={13} ry={5}
        fill={statusColor}
        opacity={isError ? 0.35 : isActive ? 0.28 : 0.16}>
        {isActive && (
          <animate attributeName="opacity" values="0.28;0.5;0.28" dur="2s" repeatCount="indefinite" />
        )}
        {isError && (
          <animate attributeName="opacity" values="0.35;0.7;0.35" dur="0.45s" repeatCount="indefinite" />
        )}
      </ellipse>
      {/* Status ring outline around the base */}
      <ellipse cx={0} cy={11} rx={13} ry={5} fill="none"
        stroke={statusColor} strokeWidth={1.4}
        strokeOpacity={isError ? 0.95 : isActive ? 0.75 : 0.45}>
        {isActive && (
          <animate attributeName="stroke-opacity" values="0.75;1;0.75" dur="2s" repeatCount="indefinite" />
        )}
        {isError && (
          <animate attributeName="stroke-opacity" values="0.95;0.2;0.95" dur="0.45s" repeatCount="indefinite" />
        )}
      </ellipse>

      {/* ── Selection dashed orbit ring ── */}
      {isSelected && (
        <ellipse cx={0} cy={11} rx={17} ry={6.5} fill="none"
          stroke={roomColor} strokeWidth={1.6} strokeOpacity={0.9} strokeDasharray="3 3">
          <animateTransform attributeName="transform" type="rotate"
            from="0 0 11" to="360 0 11" dur="4s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* ── Role-specific idle action (only when standing still) ── */}
      {showAction && <RoleAction roomId={agent.room} color={roomColor} />}

      {/* ── Character sprite (raster, illustrated) ── */}
      <g style={{ animation: bob }}>
        {/* Inner group flips horizontally based on walk direction */}
        <g transform={`scale(${facing}, 1)`}>
          <image
            href={agent.sprite}
            x={-IMG / 2}
            y={-IMG + 8}
            width={IMG}
            height={IMG}
            opacity={dimmed ? 0.6 : 1}
            preserveAspectRatio="xMidYMax meet"
            style={{ imageRendering: "pixelated" }}
          />
        </g>
      </g>

      {/* ── Status chip (top-right of sprite) ── */}
      {(isPaused || isError || isRateLimited || isIdle) && (
        <g transform="translate(10, -22)">
          <circle cx={0} cy={0} r={5} fill="#05060a" stroke={statusColor} strokeWidth={1} />
          {isPaused && (
            <>
              <rect x={-2.2} y={-2.4} width={1.6} height={4.8} fill={statusColor} />
              <rect x={0.6}  y={-2.4} width={1.6} height={4.8} fill={statusColor} />
            </>
          )}
          {isError && (
            <>
              <rect x={-0.8} y={-2.8} width={1.6} height={3.4} fill={statusColor} />
              <rect x={-0.8} y={1.4}  width={1.6} height={1.6} fill={statusColor} />
            </>
          )}
          {isRateLimited && (
            <>
              <circle cx={0} cy={0} r={2.6} fill="none" stroke={statusColor} strokeWidth={0.8} />
              <line x1={0} y1={0} x2={0} y2={-1.8} stroke={statusColor} strokeWidth={0.8} strokeLinecap="round" />
              <line x1={0} y1={0} x2={1.6} y2={0} stroke={statusColor} strokeWidth={0.8} strokeLinecap="round" />
            </>
          )}
          {isIdle && (
            <circle cx={0} cy={0} r={1.8} fill={statusColor} opacity={0.7} />
          )}
        </g>
      )}

      {/* ── Name tag + task (compact by default, expands when selected) ── */}
      <g style={{ animation: "badge-float 3s ease-in-out infinite" }}>
        {isSelected ? (
          <>
            <rect x={-44} y={-42} width={88} height={17} rx={2}
              fill="#030508" stroke={statusColor} strokeWidth={1} strokeOpacity={0.9} />
            <rect x={-44} y={-42} width={2.5} height={17} rx={2} fill={roomColor} opacity={0.85} />
            <text x={1} y={-36.5} textAnchor="middle" dominantBaseline="middle"
              fontSize={6.5} fontFamily="monospace" letterSpacing={0.6}
              fill={statusColor} fontWeight="bold">
              {displayName}
            </text>
            <text x={1} y={-29} textAnchor="middle" dominantBaseline="middle"
              fontSize={4.8} fontFamily="monospace" fill="#8899bb">
              {agent.task.length > 26 ? agent.task.slice(0, 26) + "…" : agent.task}
            </text>
            <line x1={0} y1={-25} x2={0} y2={-20} stroke={statusColor} strokeWidth={0.7} strokeOpacity={0.6} />
          </>
        ) : (
          <>
            <rect x={-nameW / 2} y={-40} width={nameW} height={11} rx={2}
              fill="#030508" stroke={statusColor} strokeWidth={0.8} strokeOpacity={0.7} />
            <text x={0} y={-34.2} textAnchor="middle" dominantBaseline="middle"
              fontSize={5.6} fontFamily="monospace" letterSpacing={0.4}
              fill={statusColor} fontWeight="bold">
              {displayName}
            </text>
            <line x1={0} y1={-29} x2={0} y2={-22} stroke={statusColor} strokeWidth={0.6} strokeOpacity={0.45} />
          </>
        )}
      </g>
    </g>
  )
}
