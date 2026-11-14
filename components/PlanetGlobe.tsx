"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { Group, SRGBColorSpace, TextureLoader } from "three";
import type { Planet } from "@/lib/types";

function Sphere({ planet }: { planet: Planet }) {
  const group = useRef<Group>(null);
  const texture = useLoader(TextureLoader, `/images/${planet}.jpg`);
  useEffect(() => { texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; }, [texture]);
  useFrame((_, delta) => { if (group.current) group.current.rotation.y += delta * .018; });
  return <group ref={group}><mesh><sphereGeometry args={[1, 96, 64]} /><meshStandardMaterial map={texture} color={planet === "mars" ? "#ffcfaa" : "#ffffff"} roughness={1} metalness={0} /></mesh></group>;
}

export default function PlanetGlobe({ planet }: { planet: Planet }) {
  return <div className="globe" aria-label={`${planet} globe`} style={{ pointerEvents: "none" }}><Canvas camera={{ position: [0, 0, 3], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.6]}><ambientLight intensity={planet === "mars" ? .34 : .47} /><directionalLight position={[-3, 2, 5]} intensity={planet === "mars" ? 2.1 : 1.75} color={planet === "mars" ? "#ffc18e" : "#e4f0ff"} /><directionalLight position={[3, -2, -4]} intensity={planet === "mars" ? .2 : .5} color={planet === "mars" ? "#b94d23" : "#74b9e6"} /><Suspense fallback={null}><Sphere planet={planet} /></Suspense></Canvas></div>;
}
