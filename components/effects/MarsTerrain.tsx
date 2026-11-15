"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const Topography = dynamic(() => import("./Topography"), { ssr: false });

/** A decorative contour field. It is not a planetary elevation dataset. */
export function MarsTerrain({ className = "" }: { className?: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  return <div className={`mars-terrain ${className}`} aria-hidden="true">
    <Topography color="#ef7548" lineCount={18} lineWidth={1.1} elevation={1.1} foreground={0.17} scale={1.2} detail={0.28} tilt={34} speed={0.12} direction="forward" morph={0.08} glow={0.5} depthOfField={0.35} fog={0.52} brightness={0.9} opacity={0.68} mouseInteraction={false} clickEffect="none" markers="none" intro={false} dpr={1} style={{}} />
  </div>;
}
