"use client";

import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { BackSide, Group, Mesh, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Planet, PlanetPoint } from "@/lib/types";

function Controls() {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement);
    control.enablePan = false;
    control.enableDamping = true;
    control.dampingFactor = 0.055;
    control.minDistance = 2.7;
    control.maxDistance = 7.5;
    controls.current = control;
    return () => { control.dispose(); controls.current = null; };
  }, [camera, gl]);
  useFrame(() => controls.current?.update());
  return null;
}

function GlobeMesh({ planet, point, onPoint }: { planet: Planet; point: PlanetPoint | null; onPoint?: (point: PlanetPoint) => void }) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const texture = useLoader(TextureLoader, `/images/${planet}.jpg`);
  useEffect(() => { texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; }, [texture]);
  useFrame((_, delta) => { if (group.current) group.current.rotation.y += delta * 0.035; });
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPoint || !mesh.current) return;
    event.stopPropagation();
    const local = mesh.current.worldToLocal(event.point.clone()).normalize();
    const lat = Math.asin(local.y) * 180 / Math.PI;
    const lon = Math.atan2(-local.z, local.x) * 180 / Math.PI;
    onPoint({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
  };
  const marker = point ? new Vector3(
    Math.cos(point.lat * Math.PI / 180) * Math.cos(point.lon * Math.PI / 180),
    Math.sin(point.lat * Math.PI / 180),
    -Math.cos(point.lat * Math.PI / 180) * Math.sin(point.lon * Math.PI / 180),
  ).multiplyScalar(1.013) : null;
  return <group ref={group}>
    <mesh ref={mesh} onClick={handleClick}>
      <sphereGeometry args={[1, 96, 64]} />
      <meshStandardMaterial map={texture} color={planet === "mars" ? "#ffd0ae" : "#ffffff"} roughness={1} metalness={0} />
    </mesh>
    {marker && <group position={marker}>
      <mesh><sphereGeometry args={[0.016, 12, 12]} /><meshBasicMaterial color={planet === "mars" ? "#ff9b4a" : "#79d9ff"} /></mesh>
      <mesh><sphereGeometry args={[0.034, 16, 16]} /><meshBasicMaterial color={planet === "mars" ? "#ff9b4a" : "#79d9ff"} transparent opacity={0.3} /></mesh>
    </group>}
    <mesh scale={1.06}><sphereGeometry args={[1, 64, 48]} /><meshBasicMaterial color={planet === "mars" ? "#de5521" : "#61b4ed"} side={BackSide} transparent opacity={0.095} /></mesh>
  </group>;
}

export default function PlanetGlobe({ planet, point = null, onPoint, className = "" }: { planet: Planet; point?: PlanetPoint | null; onPoint?: (point: PlanetPoint) => void; className?: string }) {
  return <div className={`globe ${className}`} aria-label={`Interactive ${planet} globe`}>
    <Canvas camera={{ position: [0, 0, 3.55], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.8]}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[-3, 2, 5]} intensity={2.2} color={planet === "mars" ? "#ffd1a4" : "#e0eeff"} />
      <directionalLight position={[3, -2, -4]} intensity={planet === "mars" ? 0.35 : 0.8} color={planet === "mars" ? "#bd451e" : "#5095d5"} />
      <Suspense fallback={null}><GlobeMesh planet={planet} point={point} onPoint={onPoint} /></Suspense>
      <Controls />
    </Canvas>
  </div>;
}
