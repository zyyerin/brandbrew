import React from "react";
import { LAYOUT } from "../../utils/design-tokens";

interface NoodleConnectionsProps {
  cardEndpoints: Array<{ x: number; y: number }>;
  portX: number;
  portY: number;
}

export function NoodleConnections({ cardEndpoints, portX, portY }: NoodleConnectionsProps) {
  if (cardEndpoints.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 17, overflow: "visible" }}
    >
      {cardEndpoints.map((ep, i) => {
        const dx = portX - ep.x;
        const cpX = Math.abs(dx) * 0.4;
        return (
          <g key={i}>
            <path
              d={`M ${ep.x},${ep.y} C ${ep.x + cpX},${ep.y} ${portX - cpX},${portY} ${portX},${portY}`}
              fill="none"
              stroke="var(--bb-user-active-accent)"
              strokeWidth={2}
              strokeOpacity={0.25}
            />
            <circle
              cx={ep.x}
              cy={ep.y}
              r={LAYOUT.connection.portRadius}
              fill="var(--bb-user-active-accent)"
            />
          </g>
        );
      })}
      <circle
        cx={portX}
        cy={portY}
        r={LAYOUT.connection.portRadius + 1}
        fill="var(--bb-user-active-accent)"
      />
    </svg>
  );
}
