"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const Topography = dynamic(() => import("./Topography"), { ssr: false });

/** Fullscreen decorative Mars topography contour field (React Bits). */
export function MarsTerrain({ className = "" }: { className?: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  return (
    <div className={`mars-terrain ${className}`} aria-hidden="true">
      <Topography
        color="#ef7548"
        lineCount={22}
        lineWidth={1.15}
        elevation={1.2}
        foreground={0.15}
        scale={1.3}
        detail={0.3}
        tilt={32}
        speed={0.11}
        direction="forward"
        morph={0.08}
        glow={0.5}
        depthOfField={0.32}
        fog={0.48}
        brightness={0.92}
        opacity={0.7}
        mouseInteraction={false}
        clickEffect="none"
        markers="none"
        intro={false}
        dpr={1}
        style={{ width: "100vw", height: "100vh" }}
      />
    </div>
  );
}
