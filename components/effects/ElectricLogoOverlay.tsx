"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Planet } from "@/lib/types";
import type { ElectricLogoProps } from "./ElectricLogo";

const ElectricLogo = dynamic<ElectricLogoProps>(
  () => import("./ElectricLogo") as Promise<{ default: ComponentType<ElectricLogoProps> }>,
  { ssr: false }
);

// High-precision vector silhouettes for SDF electric plasma tracing
const MARS_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
  '<circle cx="128" cy="128" r="68" fill="#fff"/>' +
  '<ellipse cx="128" cy="128" rx="114" ry="36" fill="none" stroke="#fff" stroke-width="9" transform="rotate(-25 128 128)"/>' +
  '</svg>'
)}`;

const MOON_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
  '<path d="M128 24 A104 104 0 1 0 232 128 A82 82 0 1 1 128 24 Z" fill="#fff"/>' +
  '</svg>'
)}`;

interface Props {
  planet: Planet;
  visible: boolean;
}

export function ElectricLogoOverlay({ planet, visible }: Props) {
  if (!visible) return null;

  const isMars = planet === "mars";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(7, 9, 14, 0.88)",
        backdropFilter: "blur(12px)",
        transition: "opacity 0.35s ease",
        animation: "electricFadeIn 0.3s ease forwards",
      }}
    >
      <ElectricLogo
        src={isMars ? MARS_SVG : MOON_SVG}
        color={isMars ? "#ff9147" : "#9ae0ff"}
        glowColor={isMars ? "#f05a28" : "#38bdf8"}
        scale={0.52}
        strands={5}
        bend={0.65}
        crackle={1.4}
        arcs={3}
        speed={3.2}
        interactive={false}
        style={{ width: "100vw", height: "70vh" }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "16%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            letterSpacing: "0.18em",
            color: isMars ? "#ff9147" : "#9ae0ff",
            fontWeight: 600,
          }}
        >
          TARGET ACQUIRED · {planet.toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "rgba(255, 255, 255, 0.45)",
          }}
        >
          INITIALIZING CARTOGRAPHIC TELEMETRY...
        </span>
      </div>
    </div>
  );
}
