"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Comparison, PlanetCell } from "@/lib/science-api";
import type { Planet } from "@/lib/types";

type ExplorerState = {
  planet: Planet;
  selectPlanet: (planet: Planet, origin?: { x: number; y: number }, navigate?: () => void) => Promise<void>;
  selected: PlanetCell | null;
  setSelected: (cell: PlanetCell | null) => void;
  comparison: Comparison | null;
  saveComparison: (comparison: Comparison) => void;
};
const ExplorerContext = createContext<ExplorerState | null>(null);
const RESULT_KEY = "pae-terrain-comparison-v1";

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [planet, setPlanet] = useState<Planet>("mars");
  const [selected, setSelected] = useState<PlanetCell | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pae-planet");
      if (saved === "mars" || saved === "moon") setPlanet(saved);
      const previous = sessionStorage.getItem(RESULT_KEY);
      if (previous) setComparison(JSON.parse(previous));
    } catch { /* Browser storage is optional. */ }
    setRestored(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.planet = planet;
    if (restored) {
      try { localStorage.setItem("pae-planet", planet); } catch { /* Browser storage is optional. */ }
    }
  }, [planet, restored]);

  async function selectPlanet(next: Planet, origin?: { x: number; y: number }, navigate?: () => void) {
    if (next === planet && !navigate) return;
    const update = () => {
      if (next !== planet) setSelected(null);
      setPlanet(next);
      navigate?.();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const wave = document.createElement("div");
    wave.className = `atlas-wave atlas-wave-${next}`;
    wave.setAttribute("aria-hidden", "true");
    wave.style.setProperty("--wave-x", `${origin?.x ?? window.innerWidth / 2}px`);
    wave.style.setProperty("--wave-y", `${origin?.y ?? window.innerHeight / 2}px`);
    for (let band = 0; band < 3; band++) wave.append(document.createElement("span"));
    document.body.append(wave);
    window.setTimeout(() => wave.remove(), 1150);
    await new Promise(resolve => window.setTimeout(resolve, 245));
    update();
  }

  function saveComparison(result: Comparison) {
    setComparison(result);
    try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(result)); } catch { /* Browser storage is optional. */ }
  }

  return <ExplorerContext.Provider value={{ planet, selectPlanet, selected, setSelected, comparison, saveComparison }}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const context = useContext(ExplorerContext);
  if (!context) throw new Error("ExplorerProvider is missing");
  return context;
}
