"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AnalogResult, Criteria, Planet, PlanetPoint } from "@/lib/types";
import { DEFAULT_CRITERIA } from "@/lib/types";

type ExplorerState = {
  planet: Planet;
  setPlanet: (planet: Planet) => void;
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

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [planet, setPlanet] = useState<Planet>("mars");
  const [point, setPoint] = useState<PlanetPoint | null>(null);
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);
  const [results, setResults] = useState<AnalogResult[]>([]);
  const [searchNote, setSearchNote] = useState("");
  useEffect(() => { document.documentElement.dataset.planet = planet; }, [planet]);
  return <ExplorerContext.Provider value={{ planet, setPlanet, point, setPoint, criteria, setCriteria, results, setResults, searchNote, setSearchNote }}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const context = useContext(ExplorerContext);
  if (!context) throw new Error("ExplorerProvider is missing");
  return context;
}
