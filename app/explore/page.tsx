"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Database, Info, LoaderCircle, Rocket, RotateCcw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import { PlanetMap } from "@/components/PlanetMap";
import { MarsTerrain } from "@/components/effects/MarsTerrain";
import { DEFAULT_CRITERIA } from "@/lib/types";
import type { Criteria, Planet } from "@/lib/types";

const unavailable = [
  { id: "terrain", label: "Terrain & slope", description: "Numeric slope grid is not connected for this planet." },
  { id: "surface", label: "Surface & geology", description: "The supplied geology texture can be viewed, but its legend is not validated for category filtering." },
  { id: "elevation", label: "Elevation", description: "A verified elevation raster with units and coordinate convention is not connected." },
];

export default function ExplorePage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { planet, selectPlanet, point, setPoint, criteria, setCriteria, setResults, setSearchNote } = useExplorer();
  const [query, setQuery] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [interpreting, setInterpreting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [departing, setDeparting] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("temperature");
  const active = [criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Temperature" : null, criteria.precipitationMax !== null ? "Precipitation" : null].filter(Boolean) as string[];
  const change = (patch: Partial<Criteria>) => setCriteria({ ...criteria, ...patch });

  async function interpret() {
    setAiMessage(""); setInterpreting(true);
    try {
      const response = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, planet }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Interpretation failed");
      const value = data.interpretation;
      setCriteria({ temperatureMin: value.temperatureMin, temperatureMax: value.temperatureMax, precipitationMax: value.precipitationMax, mission: value.mission });
      setUnsupported(value.unsupported);
      setAiMessage(value.explanation || "Criteria applied. Review them before searching.");
    } catch (cause) { setAiMessage(cause instanceof Error ? cause.message : "Gemini is unavailable."); }
    finally { setInterpreting(false); }
  }
  async function search() {
    setError(""); setSearching(true);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planet, point, criteria }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setResults(data.results); setSearchNote(data.methodology);
      if (!reduce) { setDeparting(true); await new Promise(resolve => setTimeout(resolve, 1150)); }
      router.push("/results");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed"); setDeparting(false); }
    finally { setSearching(false); }
  }
  async function switchWorld(next: Planet, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    await selectPlanet(next, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }
  return <main className="explore-page">
    {planet === "mars" && <MarsTerrain className="mars-terrain-explore" />}
    <div className="explore-heading"><div><p className="overline">EXPLORATION / {planet.toUpperCase()}</p><h1>{planet === "mars" ? "Mars" : "Moon"} surface explorer</h1><p>Choose a location on the map, then define the conditions for an Earth field site.</p></div><div className="planet-tabs"><button className={planet === "mars" ? "active" : ""} onClick={event => switchWorld("mars", event.currentTarget)}>Mars</button><button className={planet === "moon" ? "active" : ""} onClick={event => switchWorld("moon", event.currentTarget)}>Moon</button></div></div>
    <div className="explorer-layout">
      <section className="map-panel" aria-label={`${planet} geographic explorer`}><PlanetMap planet={planet} point={point} onPoint={setPoint} /><div className="map-underbar"><span><span className="legend-swatch" /> Selected point</span><span>No verified numerical planetary layers connected · no matching regions drawn</span><span>Planetocentric latitude / east longitude</span></div></section>
      <aside className="filter-panel" aria-label="Scientific filters"><div className="filters-title"><div><p className="overline">SCIENTIFIC CRITERIA</p><h2>Define the environment</h2></div><span>{active.length} ACTIVE</span></div>
        <div className="filter-content"><div className="mode-label"><span>MANUAL FILTERS</span><button onClick={() => { setCriteria(DEFAULT_CRITERIA); setUnsupported([]); }}><RotateCcw size={13} /> Reset</button></div>
          <div className={`filter-accordion ${open === "temperature" ? "open" : ""}`}><button className="accordion-head" onClick={() => setOpen(open === "temperature" ? "" : "temperature")}><span><b>01</b> Temperature</span><span className="filter-status">EARTH DATA <ChevronDown size={16} /></span></button>{open === "temperature" && <div className="accordion-body"><p>Target annual mean air temperature at Earth sample points. NASA POWER T2M, °C.</p><label className="checkline"><input type="checkbox" checked={criteria.temperatureMin !== null || criteria.temperatureMax !== null} onChange={event => change({ temperatureMin: event.target.checked ? -20 : null, temperatureMax: event.target.checked ? 10 : null })} /> Include in comparison</label>{(criteria.temperatureMin !== null || criteria.temperatureMax !== null) && <div className="numeric-pair"><label>Minimum °C<input type="number" min={-90} max={60} value={criteria.temperatureMin ?? ""} onChange={event => change({ temperatureMin: event.target.value === "" ? null : Number(event.target.value) })} /></label><label>Maximum °C<input type="number" min={-90} max={60} value={criteria.temperatureMax ?? ""} onChange={event => change({ temperatureMax: event.target.value === "" ? null : Number(event.target.value) })} /></label></div>}</div>}</div>
          {unavailable.map((item, i) => <div className={`filter-accordion ${open === item.id ? "open" : ""}`} key={item.id}><button className="accordion-head" onClick={() => setOpen(open === item.id ? "" : item.id)}><span><b>0{i + 2}</b> {item.label}</span><span className="filter-status unavailable-status">NO NUMERIC LAYER <ChevronDown size={16} /></span></button>{open === item.id && <div className="accordion-body"><p>{item.description}</p><div className="data-unavailable"><Info size={15} /> Map highlights require measured, georeferenced values.</div></div>}</div>)}
          <div className={`filter-accordion ${open === "environment" ? "open" : ""}`}><button className="accordion-head" onClick={() => setOpen(open === "environment" ? "" : "environment")}><span><b>05</b> Environmental conditions</span><span className="filter-status">EARTH DATA <ChevronDown size={16} /></span></button>{open === "environment" && <div className="accordion-body"><p>Maximum annual mean precipitation at Earth sample points. NASA POWER PRECTOTCORR, mm/day.</p><label className="checkline"><input type="checkbox" checked={criteria.precipitationMax !== null} onChange={event => change({ precipitationMax: event.target.checked ? 0.5 : null })} /> Include precipitation</label>{criteria.precipitationMax !== null && <div className="range-field"><input type="range" min="0" max="10" step="0.1" value={Math.min(criteria.precipitationMax, 10)} onChange={event => change({ precipitationMax: Number(event.target.value) })} /><label><input type="number" min="0" max="50" step="0.1" value={criteria.precipitationMax} onChange={event => change({ precipitationMax: Number(event.target.value) })} /> mm/day</label></div>}</div>}</div>
          <div className={`filter-accordion ${open === "mission" ? "open" : ""}`}><button className="accordion-head" onClick={() => setOpen(open === "mission" ? "" : "mission")}><span><b>06</b> Mission purpose</span><span className="filter-status">CONTEXT <ChevronDown size={16} /></span></button>{open === "mission" && <div className="accordion-body"><p>Recorded with the search; it does not change the climate score.</p><select value={criteria.mission} onChange={event => change({ mission: event.target.value as Criteria["mission"] })}><option value="general">General exploration</option><option value="rover">Rover mobility</option><option value="geology">Geology fieldwork</option><option value="habitat">Habitat testing</option></select></div>}</div>
          <div className="ai-section"><div className="mode-label"><span><Sparkles size={16} /> AI QUERY</span><small>OPTIONAL</small></div><p>Describe a mission. Gemini fills only explicit, supported thresholds for review.</p><textarea rows={3} value={query} onChange={event => setQuery(event.target.value)} placeholder="A dry site below 10°C for rover testing…" /><button className="ai-action" disabled={interpreting || query.trim().length < 8} onClick={interpret}>{interpreting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Interpret query <ArrowRight size={15} /></button>{aiMessage && <p className="filter-message">{aiMessage}</p>}{unsupported.length > 0 && <p className="filter-message">Unavailable: {unsupported.join(", ")}</p>}</div>
        </div><div className="filter-bottom"><div className="active-line"><span>ACTIVE CRITERIA</span>{active.length ? active.map(name => <b key={name}><Check size={12} /> {name}</b>) : <em>Choose at least one</em>}</div>{error && <p className="filter-error">{error}</p>}<button className="search-action" disabled={searching || !active.length} onClick={search}>{searching ? <LoaderCircle size={18} className="spin" /> : <Search size={19} />} {searching ? "Reading NASA POWER…" : "Find Earth Analogs"} <ArrowRight size={19} /></button><div className="coverage-note"><Database size={14} /> Earth climate: NASA POWER, 2001–2020 · 5 sample points</div></div></aside>
    </div>
    <AnimatePresence>{departing && <motion.div className="departure-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="departure-source" /><div className="flight-path" /><Rocket className="flight-craft" size={30} /><div className="departure-earth" /><div className="departure-copy">SEARCH COMPLETE <strong>Returning to Earth</strong></div><button onClick={() => router.push("/results")}>Skip animation <ArrowRight size={15} /></button></motion.div>}</AnimatePresence>
  </main>;
}
