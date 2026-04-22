import React from "react";
import { LAYOUT } from "../../utils/design-tokens";

interface ConceptNoodleConnectionsProps {
  cardEndpoints: Array<{ x: number; y: number }>;
  portX: number;
  portY: number;
}

export function ConceptNoodleConnections({ cardEndpoints, portX, portY }: ConceptNoodleConnectionsProps) {
  if (cardEndpoints.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 17, overflow: "visible" }}
    >
      {cardEndpoints.map((ep, i) => {
        const dx = ep.x - portX;
        const cpX = Math.abs(dx) * 0.4;
        return (
          <g key={i}>
            <path
              d={`M ${portX},${portY} C ${portX + cpX},${portY} ${ep.x - cpX},${ep.y} ${ep.x},${ep.y}`}
              fill="none"
              stroke="var(--bb-ai-active-ring)"
              strokeWidth={2}
              strokeOpacity={0.2}
            />
            <circle
              cx={ep.x}
              cy={ep.y}
              r={LAYOUT.connection.portRadius}
              fill="var(--bb-ai-active-ring)"
              fillOpacity={0.6}
            />
          </g>
        );
      })}
      <circle
        cx={portX}
        cy={portY}
        r={LAYOUT.connection.portRadius + 1}
        fill="var(--bb-ai-active-ring)"
      />
    </svg>
  );
}
