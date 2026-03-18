import React from "react";
import { LAYOUT } from "../../utils/design-tokens";

interface NoodleConnectionsProps {
  cardEndpoints: Array<{ x: number; y: number }>;
  portX: number;
  portY: number;
}

export function NoodleConnections({ cardEndpoints, portX, portY }: NoodleConnectionsProps) {
  if (cardEndpoints.length === 0) return null;
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const snappedPortX = snap(portX);
  const snappedPortY = snap(portY);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 17, overflow: "visible" }}
    >
      {cardEndpoints.map((ep, i) => {
        const sx = snap(ep.x);
        const sy = snap(ep.y);
        const dx = snappedPortX - sx;
        const cpX = Math.abs(dx) * 0.4;
        return (
          <g key={i}>
            <path
              d={`M ${sx},${sy} C ${sx + cpX},${sy} ${snappedPortX - cpX},${snappedPortY} ${snappedPortX},${snappedPortY}`}
              fill="none"
              stroke="var(--bb-user-active-accent)"
              strokeWidth={2}
              strokeOpacity={0.25}
            />
            <circle
              cx={sx}
              cy={sy}
              r={LAYOUT.PORT_RADIUS}
              fill="var(--bb-user-active-accent)"
            />
          </g>
        );
      })}
      <circle
        cx={snappedPortX}
        cy={snappedPortY}
        r={LAYOUT.PORT_RADIUS + 1}
        fill="var(--bb-user-active-accent)"
      />
    </svg>
  );
}
