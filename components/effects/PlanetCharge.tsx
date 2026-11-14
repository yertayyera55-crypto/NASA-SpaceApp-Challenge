"use client";

import ElectricLogo from "./ElectricLogo";
import type { Planet } from "@/lib/types";

type Charge = { planet: Planet; x: number; y: number; size: number };

/** Keep the WebGL effect warm so it is ready on the first planet click. */
export function PlanetCharge({ charge }: { charge: Charge | null }) {
  const mars = (charge?.planet ?? "mars") === "mars";
  const size = charge?.size ?? 360;
  return <div className={`planet-charge planet-charge-${mars ? "mars" : "moon"} ${charge ? "is-active" : ""}`} aria-hidden="true" style={{ left: charge?.x ?? "50vw", top: charge?.y ?? "50vh", width: size * 1.55, height: size * 1.55 }}>
    <ElectricLogo src="/images/planet-electric.svg" color={mars ? "#ffe0ba" : "#e6f8ff"} glowColor={mars ? "#f46b2d" : "#56bded"} scale={0.62} intensity={1.15} glow={1.35} thickness={1.7} strands={4} bend={0.7} crackle={1.4} arcs={1.8} flicker={0.8} fill={0.08} speed={2.3} interactive={false} onRender={undefined} style={{}} />
  </div>;
}
