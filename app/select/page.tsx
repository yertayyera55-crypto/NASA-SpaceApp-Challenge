"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import type { Planet } from "@/lib/types";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false });
const worlds = [
  { id: "mars", name: "Mars", description: "Jezero, Gale and Elysium Planitia" },
  { id: "moon", name: "Moon", description: "Haworth, Nobile and a south polar strip" },
] as const;

export default function SelectPage() {
  const router = useRouter();
  const { selectPlanet } = useExplorer();
  const [moving, setMoving] = useState(false);
  async function choose(target: Planet, element: HTMLElement) {
    if (moving) return;
    setMoving(true);
    const box = element.querySelector(".world-image")?.getBoundingClientRect() ?? element.getBoundingClientRect();
    await selectPlanet(target, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, () => router.push("/explore"));
  }
  return <main className="world-select">
    <div className="landing-sky" aria-hidden="true" />
    <header><h1>Choose a world</h1><p>Browse measured terrain on Mars or the Moon.</p></header>
    <div className="world-options">{worlds.map(world => <button key={world.id} type="button" className={`world-option sphere-${world.id}`} disabled={moving} onClick={event => choose(world.id, event.currentTarget)}>
      <span className="world-image" aria-hidden="true"><PlanetGlobe planet={world.id} /></span>
      <span className="world-label"><span><strong>{world.name}</strong><small>{world.description}</small></span><ArrowRight size={22} /></span>
    </button>)}</div>
  </main>;
}
