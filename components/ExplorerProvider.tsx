"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { AnalogResult, Criteria, Planet, PlanetPoint } from "@/lib/types";
import { DEFAULT_CRITERIA } from "@/lib/types";

type ExplorerState = {
  planet: Planet;
  selectPlanet: (planet: Planet, origin?: { x: number; y: number }) => Promise<void>;
  point: PlanetPoint | null;
  setPoint: (point: PlanetPoint | null) => void;
  criteria: Criteria;
  setCriteria: (criteria: Criteria) => void;
  results: AnalogResult[];
  setResults: (results: AnalogResult[]) => void;
  searchNote: string;
  setSearchNote: (note: string) => void;
};

const ExplorerContext = createContext<ExplorerState | null>(null);

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [planet, setPlanet] = useState<Planet>("mars");
  const [chosen, setChosen] = useState(false);
  const [point, setPoint] = useState<PlanetPoint | null>(null);
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);
  const [results, setResults] = useState<AnalogResult[]>([]);
  const [searchNote, setSearchNote] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("pae-planet");
    if (saved === "mars" || saved === "moon") { setPlanet(saved); setChosen(true); }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.planet = chosen ? planet : "neutral";
    if (chosen) window.localStorage.setItem("pae-planet", planet);
  }, [planet, chosen]);

  async function selectPlanet(next: Planet, origin?: { x: number; y: number }) {
    if (next === planet && chosen) return;
    const root = document.documentElement;
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 60;
    root.style.setProperty("--wave-x", `${x}px`);
    root.style.setProperty("--wave-y", `${y}px`);
    root.style.setProperty("--wave-radius", `${radius}px`);
    root.style.setProperty("--wave-color", next === "mars" ? "#f47b31" : "#69cfff");
    const update = () => {
      flushSync(() => { setPlanet(next); setChosen(true); setPoint(null); });
      root.dataset.planet = next;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
    const doc = document as ViewTransitionDocument;
    if (doc.startViewTransition) {
      await doc.startViewTransition(update).finished;
    } else {
      const wave = document.createElement("div");
      wave.className = `theme-wave theme-wave-${next}`;
      wave.style.left = `${origin?.x ?? window.innerWidth / 2}px`;
      wave.style.top = `${origin?.y ?? window.innerHeight / 2}px`;
      document.body.append(wave);
      await wave.animate([{ transform: "translate(-50%, -50%) scale(0)" }, { transform: "translate(-50%, -50%) scale(1)" }], { duration: 1150, easing: "cubic-bezier(.22,1,.36,1)" }).finished;
      update();
      wave.remove();
    }
  }

  return <ExplorerContext.Provider value={{ planet, selectPlanet, point, setPoint, criteria, setCriteria, results, setResults, searchNote, setSearchNote }}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const context = useContext(ExplorerContext);
  if (!context) throw new Error("ExplorerProvider is missing");
  return context;
}
