"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import { MarsTerrain } from "@/components/effects/MarsTerrain";
import { PlanetCharge } from "@/components/effects/PlanetCharge";
import type { Planet } from "@/lib/types";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false });

const worlds: { id: Planet; name: string; description: string }[] = [
  { id: "mars", name: "Mars", description: "A cold, dry, and rocky world with Mars-like terrain." },
  { id: "moon", name: "Moon", description: "An airless, dusty environment for testing future space technologies." },
];

export default function SelectPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { selectPlanet } = useExplorer();
  const [moving, setMoving] = useState(false);
  const [charge, setCharge] = useState<{ x: number; y: number; size: number } | null>(null);
  async function choose(target: Planet, element: HTMLElement) {
    if (moving) return;
    setMoving(true);
    const rect = element.querySelector(".world-globe")?.getBoundingClientRect() ?? element.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (!reduce && target === "moon") {
      setCharge({ ...origin, size: rect.width });
      await new Promise(resolve => setTimeout(resolve, 450));
    }
    await selectPlanet(target, origin, true);
    setCharge(null);
    router.push("/explore");
  }
  return <main className="select-page space-stage">
    <div className="stars stars-near" aria-hidden="true" /><div className="stars stars-far" aria-hidden="true" />
    <MarsTerrain className="mars-terrain-select" />
    <motion.div className="select-heading" initial={reduce ? false : { opacity: .7, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}><p className="overline">THE EXPEDITION BEGINS HERE</p><h1>Choose Your Target World</h1><p>Select a planetary environment to explore and find its Earth analogs.</p></motion.div>
    <div className="worlds">
      {worlds.map((world, index) => <motion.button key={world.id} type="button" className={`world world-${world.id}`} disabled={moving} onClick={event => choose(world.id, event.currentTarget)} initial={reduce ? false : { opacity: .65, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .12 + index * .12 }}>
        <span className="world-globe"><PlanetGlobe planet={world.id} /></span>
        <span className="world-caption"><span><strong>{world.name}</strong><small>{world.description}</small></span><span className="world-arrow"><ArrowRight size={23} strokeWidth={1.7} /></span></span>
      </motion.button>)}
    </div>
    <div className="select-horizon" aria-hidden="true" />
    {!reduce && <PlanetCharge charge={charge} />}
    <p className="select-footnote">NASA imagery for navigation · scientific data coverage shown in the explorer</p>
  </main>;
}
