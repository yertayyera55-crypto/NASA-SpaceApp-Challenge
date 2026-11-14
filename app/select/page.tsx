"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import { MarsTerrain } from "@/components/effects/MarsTerrain";
import { ElectricLogoOverlay } from "@/components/effects/ElectricLogoOverlay";
import type { Planet } from "@/lib/types";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false });

const worlds: { id: Planet; name: string; description: string }[] = [
  {
    id: "mars",
    name: "Mars",
    description: "A cold, hyper-arid world with basaltic rock, iron oxide dust, and ancient riverbeds.",
  },
  {
    id: "moon",
    name: "Moon",
    description: "An airless, high-vacuum environment with extreme thermal shifts and impact regolith.",
  },
];

export default function SelectPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { selectPlanet } = useExplorer();
  const [moving, setMoving] = useState(false);
  const [electricPlanet, setElectricPlanet] = useState<Planet | null>(null);

  useEffect(() => {
    setMoving(false);
    setElectricPlanet(null);
  }, []);

  async function choose(target: Planet, element: HTMLElement) {
    if (moving) return;
    setMoving(true);
    setElectricPlanet(target);

    // Let the ElectricLogo animation display and arc
    await new Promise(resolve => setTimeout(resolve, 950));

    await selectPlanet(target, undefined, true);
    router.push("/explore");
  }

  return (
    <main className="select-page space-stage">
      <MarsTerrain className="mars-terrain-select" />

      <ElectricLogoOverlay planet={electricPlanet ?? "mars"} visible={!!electricPlanet} />

      <motion.div
        className="select-heading"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="overline">TARGET SELECTION</p>
        <h1>Choose Your Target World</h1>
        <p>Select an environment to explore its surface maps and find matching Earth analog sites.</p>
      </motion.div>

      <div className="worlds">
        {worlds.map((world, index) => (
          <motion.button
            key={world.id}
            type="button"
            className={`world world-${world.id}`}
            disabled={moving}
            onClick={event => choose(world.id, event.currentTarget)}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 + index * 0.1 }}
          >
            <span className="world-globe">
              <PlanetGlobe planet={world.id} />
            </span>
            <span className="world-caption">
              <span>
                <strong>{world.name}</strong>
                <small>{world.description}</small>
              </span>
              <span className="world-arrow">
                <ArrowRight size={18} strokeWidth={2} />
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </main>
  );
}
