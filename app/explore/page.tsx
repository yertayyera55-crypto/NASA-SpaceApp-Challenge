"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Compass, Database, Info, Layers3, LoaderCircle, MapPin, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import { DEFAULT_CRITERIA } from "@/lib/types";
import type { Criteria, Planet } from "@/lib/types";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false, loading: () => <div className="globe globe-placeholder" /> });

export default function ExplorePage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { planet, setPlanet, point, setPoint, criteria, setCriteria, setResults, setSearchNote } = useExplorer();
  const [query, setQuery] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [interpreting, setInterpreting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [departing, setDeparting] = useState(false);
  const [error, setError] = useState("");
  const active = [criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Air temperature" : null, criteria.precipitationMax !== null ? "Precipitation" : null].filter(Boolean) as string[];

  const change = (patch: Partial<Criteria>) => setCriteria({ ...criteria, ...patch });
  const switchPlanet = (value: Planet) => { setPlanet(value); setPoint(null); };

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
      setResults(data.results);
      setSearchNote(data.methodology);
      if (!reduce) { setDeparting(true); await new Promise(resolve => setTimeout(resolve, 1050)); }
      router.push("/results");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed"); setDeparting(false); }
    finally { setSearching(false); }
  }

  return <main className="explore-page">
    <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> EXPEDITION WORKSPACE / 01</p><h1>Explore {planet === "mars" ? "Mars" : "the Moon"}<span className="heading-dot">.</span></h1><p>Locate a planetary point, then define the Earth conditions you want to compare.</p></div><div className="stepper"><span className="current">01 <b>Explore</b></span><span className="step-line" /><span>02 <b>Compare</b></span><span className="step-line" /><span>03 <b>Results</b></span></div></div>
    <div className="explore-grid">
      <section className="planet-workspace" aria-label="Planet globe">
        <div className="workspace-top"><span className="small-label"><span className="status-dot" /> LIVE SURFACE VIEW</span><div className="planet-tabs"><button className={planet === "mars" ? "active" : ""} onClick={() => switchPlanet("mars")}>Mars</button><button className={planet === "moon" ? "active" : ""} onClick={() => switchPlanet("moon")}>Moon</button></div></div>
        <motion.div className="workspace-globe" key={planet} initial={reduce ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .7 }}><PlanetGlobe planet={planet} point={point} onPoint={setPoint} /></motion.div>
        <div className="planet-coordinate"><span className="coord-icon"><Compass size={18} /></span><div><small>SELECTED SURFACE POINT</small><strong>{point ? `${point.lat.toFixed(2)}° LAT / ${point.lon.toFixed(2)}° LON` : "Click the globe to select a point"}</strong></div>{point && <button onClick={() => setPoint(null)} aria-label="Clear selected point"><X size={17} /></button>}</div>
        <div className="workspace-footer"><span><MapPin size={15} /> Planetocentric latitude · east longitude</span><span>Drag to rotate · Scroll to zoom</span></div>
      </section>
      <section className="filter-workspace" aria-label="Scientific criteria">
        <div className="filter-head"><div><p className="small-label">SCIENTIFIC COMPARISON</p><h2>Define the environment</h2></div><Layers3 size={23} /></div>
        <div className="filter-scroll">
          <div className="ai-box"><div className="section-title"><Sparkles size={18} /><span>AI query interpreter</span><small>OPTIONAL</small></div><p>Describe your objective. Gemini extracts only explicit thresholds; review the result below.</p><textarea value={query} onChange={event => setQuery(event.target.value)} placeholder="I need a dry environment below 15°C for rover testing…" rows={3} /><button className="ai-submit" disabled={interpreting || query.trim().length < 8} onClick={interpret}>{interpreting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Interpret request <ArrowRight size={16} /></button>{aiMessage && <p className="inline-message">{aiMessage}</p>}{unsupported.length > 0 && <p className="inline-warning">Unavailable measurements: {unsupported.join(", ")}</p>}</div>
          <div className="manual-head"><div className="section-title"><Layers3 size={18} /><span>Manual criteria</span></div><button onClick={() => { setCriteria(DEFAULT_CRITERIA); setUnsupported([]); }}><RotateCcw size={14} /> Reset</button></div>
          <p className="filter-note">Switching on a filter enters an editable starting value. Adjust it for your experiment.</p>
          <div className="filter-section"><div className="filter-row"><div><span className="filter-index">01</span><strong>Air temperature</strong><small>NASA POWER · annual mean at Earth sample points</small></div><label className="toggle"><input type="checkbox" checked={criteria.temperatureMin !== null || criteria.temperatureMax !== null} onChange={event => change({ temperatureMin: null, temperatureMax: event.target.checked ? 10 : null })} /><span /></label></div>{(criteria.temperatureMin !== null || criteria.temperatureMax !== null) && <div className="filter-inputs"><label>Minimum °C<input type="number" min={-90} max={60} value={criteria.temperatureMin ?? ""} onChange={event => change({ temperatureMin: event.target.value === "" ? null : Number(event.target.value) })} /></label><label>Maximum °C<input type="number" min={-90} max={60} value={criteria.temperatureMax ?? ""} onChange={event => change({ temperatureMax: event.target.value === "" ? null : Number(event.target.value) })} /></label></div>}</div>
          <div className="filter-section"><div className="filter-row"><div><span className="filter-index">02</span><strong>Precipitation</strong><small>NASA POWER · annual mean in mm/day</small></div><label className="toggle"><input type="checkbox" checked={criteria.precipitationMax !== null} onChange={event => change({ precipitationMax: event.target.checked ? 0.5 : null })} /><span /></label></div>{criteria.precipitationMax !== null && <div className="filter-inputs single"><label>Maximum mm/day<input type="number" min={0} max={50} step="0.1" value={criteria.precipitationMax} onChange={event => change({ precipitationMax: Number(event.target.value) })} /></label><input aria-label="Maximum precipitation" type="range" min={0} max={10} step="0.1" value={Math.min(criteria.precipitationMax, 10)} onChange={event => change({ precipitationMax: Number(event.target.value) })} /></div>}</div>
          <div className="filter-section"><div className="filter-row"><div><span className="filter-index">03</span><strong>Mission purpose</strong><small>Context only; not included in climate score</small></div><ChevronDown size={17} className="muted" /></div><div className="mission-options">{([ ["general", "General"], ["rover", "Rover mobility"], ["geology", "Geology"], ["habitat", "Habitat testing"] ] as const).map(([value, label]) => <label key={value}><input type="radio" name="mission" checked={criteria.mission === value} onChange={() => change({ mission: value })} />{label}</label>)}</div></div>
          <div className="unavailable"><Info size={17} /><div><strong>Terrain and geology data unavailable</strong><p>Slope, elevation, mineralogy and ice cannot be compared or drawn as coverage layers until verified numerical datasets are connected. The globe image is cartography, not a measurement layer.</p></div></div>
        </div>
        <div className="filter-bottom"><div className="active-criteria"><span className="small-label">ACTIVE EARTH CRITERIA</span>{active.length ? active.map(label => <span className="criterion-chip" key={label}><Check size={12} />{label}</span>) : <span className="no-criteria">None selected</span>}</div>{error && <p className="inline-warning">{error}</p>}<button className="button-primary search-button" onClick={search} disabled={searching}>{searching ? <LoaderCircle className="spin" size={18} /> : <Database size={18} />} {searching ? "Reading NASA climate data…" : "Find Earth analogs"} <ArrowRight size={18} /></button><Link href="/methodology" className="method-link">Data sources & methodology <ArrowRight size={14} /></Link></div>
      </section>
    </div>
    <AnimatePresence>{departing && <motion.div className="departure" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span className={`departure-world ${planet}`} /><svg viewBox="0 0 500 180" preserveAspectRatio="none" aria-hidden="true"><path d="M 36 122 Q 220 -50 462 75" /><circle r="5"><animateMotion dur="1s" fill="freeze" path="M 36 122 Q 220 -50 462 75" /></circle></svg><span className="departure-earth">EARTH</span><p>TRACING EARTH ANALOGS</p></motion.div>}</AnimatePresence>
  </main>;
}
