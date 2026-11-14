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
  { id: "terrain", label: "Terrain & slope", description: "Numeric slope grid is not connected for this planet in this release." },
  { id: "surface", label: "Surface & geology", description: "The supplied geology texture can be viewed as an overlay, but its legend is not validated for numerical class filtering." },
  { id: "elevation", label: "Elevation raster", description: "A verified elevation model with standardized units and global coordinate convention is not connected." },
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

  const active = [
    criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Temperature" : null,
    criteria.precipitationMax !== null ? "Precipitation" : null,
  ].filter(Boolean) as string[];

  const change = (patch: Partial<Criteria>) => setCriteria({ ...criteria, ...patch });

  async function interpret() {
    setAiMessage("");
    setInterpreting(true);
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, planet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Interpretation failed");
      const value = data.interpretation;
      setCriteria({
        temperatureMin: value.temperatureMin,
        temperatureMax: value.temperatureMax,
        precipitationMax: value.precipitationMax,
        mission: value.mission,
      });
      setUnsupported(value.unsupported);
      setAiMessage(value.explanation || "Criteria applied. Review extracted thresholds before executing search.");
    } catch (cause) {
      setAiMessage(cause instanceof Error ? cause.message : "Gemini interpretation service is currently unavailable.");
    } finally {
      setInterpreting(false);
    }
  }

  async function search() {
    setError("");
    setSearching(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planet, point, criteria }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setResults(data.results);
      setSearchNote(data.methodology);
      if (!reduce) {
        setDeparting(true);
        await new Promise(resolve => setTimeout(resolve, 1150));
      }
      router.push("/results");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
      setDeparting(false);
    } finally {
      setSearching(false);
    }
  }

  async function switchWorld(next: Planet, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    await selectPlanet(next, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }

  return (
    <main className="explore-page">
      {planet === "mars" && <MarsTerrain className="mars-terrain-explore" />}
      <div className="explore-heading">
        <div>
          <p className="overline">CARTOGRAPHIC EXPLORATION / {planet.toUpperCase()}</p>
          <h1>{planet === "mars" ? "Mars" : "Moon"} Surface Explorer</h1>
          <p>Screen NASA POWER Earth analog candidates across surface coordinates using calibrated environmental criteria.</p>
        </div>
        <div className="planet-tabs">
          <button className={planet === "mars" ? "active" : ""} onClick={event => switchWorld("mars", event.currentTarget)}>
            Mars
          </button>
          <button className={planet === "moon" ? "active" : ""} onClick={event => switchWorld("moon", event.currentTarget)}>
            Moon
          </button>
        </div>
      </div>

      <div className="explorer-layout">
        <section className="map-panel" aria-label={`${planet} geographic explorer`}>
          <PlanetMap planet={planet} point={point} onPoint={setPoint} />
          <div className="map-underbar">
            <span>
              <span className="legend-swatch" /> Selected coordinate
            </span>
            <span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              Candidate Earth analogs
            </span>
            <span>Planetocentric latitude / east longitude</span>
          </div>
        </section>

        <aside className="filter-panel" aria-label="Scientific filters">
          <div className="filters-title">
            <div className="filters-title-left">
              <p className="overline">SCIENTIFIC CRITERIA</p>
              <h2>Define Environment</h2>
            </div>
            <div className="filters-title-actions">
              <span className="active-pill">{active.length} ACTIVE</span>
              <button
                type="button"
                className="reset-btn"
                onClick={() => { setCriteria(DEFAULT_CRITERIA); setUnsupported([]); }}
                title="Reset all criteria to defaults"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>

          <div className="filter-content">
            {/* Temperature */}
            <div className={`filter-accordion ${open === "temperature" ? "open" : ""}`}>
              <button className="accordion-head" onClick={() => setOpen(open === "temperature" ? "" : "temperature")}>
                <span>Air Temperature</span>
                <span className="filter-status">EARTH DATA <ChevronDown size={14} /></span>
              </button>
              {open === "temperature" && (
                <div className="accordion-body">
                  <p>Target annual mean air temperature at Earth analog points. Derived from NASA POWER T2M (2001–2020), in °C.</p>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={criteria.temperatureMin !== null || criteria.temperatureMax !== null}
                      onChange={event => change({
                        temperatureMin: event.target.checked ? -20 : null,
                        temperatureMax: event.target.checked ? 10 : null,
                      })}
                    />
                    Include in suitability evaluation
                  </label>
                  {(criteria.temperatureMin !== null || criteria.temperatureMax !== null) && (
                    <div className="numeric-pair">
                      <label>
                        Minimum °C
                        <input
                          type="number"
                          min={-90}
                          max={60}
                          value={criteria.temperatureMin ?? ""}
                          onChange={event => change({ temperatureMin: event.target.value === "" ? null : Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Maximum °C
                        <input
                          type="number"
                          min={-90}
                          max={60}
                          value={criteria.temperatureMax ?? ""}
                          onChange={event => change({ temperatureMax: event.target.value === "" ? null : Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Unavailable Planetary Numerical Layers */}
            {unavailable.map((item) => (
              <div className={`filter-accordion ${open === item.id ? "open" : ""}`} key={item.id}>
                <button className="accordion-head" onClick={() => setOpen(open === item.id ? "" : item.id)}>
                  <span>{item.label}</span>
                  <span className="filter-status unavailable-status">NO NUMERICAL LAYER <ChevronDown size={14} /></span>
                </button>
                {open === item.id && (
                  <div className="accordion-body">
                    <p>{item.description}</p>
                    <div className="data-unavailable">
                      <Info size={14} /> Highlights require calibrated, georeferenced raster datasets.
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Environmental Conditions / Precipitation */}
            <div className={`filter-accordion ${open === "environment" ? "open" : ""}`}>
              <button className="accordion-head" onClick={() => setOpen(open === "environment" ? "" : "environment")}>
                <span>Precipitation (Aridity)</span>
                <span className="filter-status">EARTH DATA <ChevronDown size={14} /></span>
              </button>
              {open === "environment" && (
                <div className="accordion-body">
                  <p>Maximum annual mean precipitation at Earth analog points. Derived from NASA POWER PRECTOTCORR, in mm/day.</p>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={criteria.precipitationMax !== null}
                      onChange={event => change({ precipitationMax: event.target.checked ? 0.5 : null })}
                    />
                    Include precipitation threshold
                  </label>
                  {criteria.precipitationMax !== null && (
                    <div className="range-field">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={Math.min(criteria.precipitationMax, 10)}
                        onChange={event => change({ precipitationMax: Number(event.target.value) })}
                      />
                      <label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.1"
                          value={criteria.precipitationMax}
                          onChange={event => change({ precipitationMax: Number(event.target.value) })}
                        />
                        mm/day
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mission Purpose */}
            <div className={`filter-accordion ${open === "mission" ? "open" : ""}`}>
              <button className="accordion-head" onClick={() => setOpen(open === "mission" ? "" : "mission")}>
                <span>Mission Purpose</span>
                <span className="filter-status">CONTEXT <ChevronDown size={14} /></span>
              </button>
              {open === "mission" && (
                <div className="accordion-body">
                  <p>Recorded as scientific context with your query; does not arbitrarily alter the climate suitability index.</p>
                  <select
                    value={criteria.mission}
                    onChange={event => change({ mission: event.target.value as Criteria["mission"] })}
                  >
                    <option value="general">General planetary exploration</option>
                    <option value="rover">Rover mobility & chassis testing</option>
                    <option value="geology">Geology & regolith fieldwork</option>
                    <option value="habitat">Extreme habitat & life support</option>
                  </select>
                </div>
              )}
            </div>

            {/* AI Assistant */}
            <div className="ai-section">
              <div className="ai-header">
                <span><Sparkles size={14} /> AI QUERY ASSISTANT</span>
              </div>
              <p>Describe your mission objectives. Gemini extracts explicit numerical thresholds without hallucinating data.</p>
              <textarea
                rows={3}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="e.g. Extreme arid cold desert below 5°C with minimal rainfall for rover mobility trials..."
              />
              <button
                className="ai-action"
                disabled={interpreting || query.trim().length < 8}
                onClick={interpret}
              >
                {interpreting ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
                Interpret Query <ArrowRight size={13} />
              </button>
              {aiMessage && <p className="filter-message">{aiMessage}</p>}
              {unsupported.length > 0 && (
                <p className="filter-message">Unsupported parameters requested: {unsupported.join(", ")}</p>
              )}
            </div>
          </div>

          <div className="filter-bottom">
            <div className="active-line">
              <span>ACTIVE PARAMETERS:</span>
              {active.length ? (
                active.map(name => (
                  <b key={name}><Check size={11} /> {name}</b>
                ))
              ) : (
                <em>Select at least one criterion</em>
              )}
            </div>
            {error && <p className="filter-error">{error}</p>}
            <button
              className="search-action"
              disabled={searching || !active.length}
              onClick={search}
            >
              {searching ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
              {searching ? "Searching Analog Sites…" : "Find Earth Analogs"}
              <ArrowRight size={16} />
            </button>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {departing && (
          <motion.div
            className="departure-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="departure-source" />
            <div className="flight-path" />
            <Rocket className="flight-craft" size={28} />
            <div className="departure-earth" />
            <div className="departure-copy">
              EVALUATION COMPLETE
              <strong>Returning to Earth Analogs</strong>
            </div>
            <button onClick={() => router.push("/results")}>
              Skip animation <ArrowRight size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
