"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Compass, Droplets, Info, Layers, LoaderCircle, Rocket, RotateCcw, Search, Sparkles, Thermometer } from "lucide-react";
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
  const [showRoadmap, setShowRoadmap] = useState(false);

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
              <p className="filters-subtitle">Configure climate &amp; mission constraints to screen candidate Earth field analogs</p>
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
            {/* Criterion 1: Air Temperature */}
            <div className={`criteria-card ${criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "active" : ""}`}>
              <div className="criteria-card-header">
                <div className="criteria-title-group">
                  <div className="criteria-icon-box">
                    <Thermometer size={16} />
                  </div>
                  <div>
                    <div className="criteria-name-row">
                      <h3>Air Temperature</h3>
                      <span className="criteria-tag">T2M · °C</span>
                    </div>
                    <p className="criteria-subtext">20-year annual mean surface air temperature (NASA POWER)</p>
                  </div>
                </div>

                {/* Tactile toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={criteria.temperatureMin !== null || criteria.temperatureMax !== null}
                  className={`human-switch ${criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "on" : ""}`}
                  onClick={() => {
                    const isCurrentlyOn = criteria.temperatureMin !== null || criteria.temperatureMax !== null;
                    change({
                      temperatureMin: isCurrentlyOn ? null : -20,
                      temperatureMax: isCurrentlyOn ? null : 10,
                    });
                  }}
                  title={criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Disable temperature filter" : "Enable temperature filter"}
                >
                  <span className="human-switch-thumb" />
                </button>
              </div>

              {criteria.temperatureMin !== null || criteria.temperatureMax !== null ? (
                <div className="criteria-card-body">
                  <div className="criteria-readout">
                    <span>Target Range:</span>
                    <strong>{criteria.temperatureMin ?? -90}°C &nbsp;to&nbsp; {criteria.temperatureMax ?? 60}°C</strong>
                  </div>

                  <div className="numeric-inputs-row">
                    <div className="input-group">
                      <label htmlFor="temp-min">Min Temp</label>
                      <div className="input-with-unit">
                        <input
                          id="temp-min"
                          type="number"
                          min={-90}
                          max={60}
                          value={criteria.temperatureMin ?? ""}
                          onChange={e => change({ temperatureMin: e.target.value === "" ? null : Number(e.target.value) })}
                          placeholder="-20"
                        />
                        <span className="unit-label">°C</span>
                      </div>
                    </div>
                    <div className="input-group">
                      <label htmlFor="temp-max">Max Temp</label>
                      <div className="input-with-unit">
                        <input
                          id="temp-max"
                          type="number"
                          min={-90}
                          max={60}
                          value={criteria.temperatureMax ?? ""}
                          onChange={e => change({ temperatureMax: e.target.value === "" ? null : Number(e.target.value) })}
                          placeholder="10"
                        />
                        <span className="unit-label">°C</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="preset-chips">
                    <span className="preset-label">Presets:</span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ temperatureMin: -50, temperatureMax: -10 })}
                    >
                      Polar (&lt; -10°C)
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ temperatureMin: -20, temperatureMax: 10 })}
                    >
                      Cold Arid (-20..10°C)
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ temperatureMin: 0, temperatureMax: 25 })}
                    >
                      Temperate (0..25°C)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="criteria-card-inactive">
                  <span>Filter inactive — click toggle to evaluate temperature suitability</span>
                </div>
              )}
            </div>

            {/* Criterion 2: Annual Precipitation */}
            <div className={`criteria-card ${criteria.precipitationMax !== null ? "active" : ""}`}>
              <div className="criteria-card-header">
                <div className="criteria-title-group">
                  <div className="criteria-icon-box">
                    <Droplets size={16} />
                  </div>
                  <div>
                    <div className="criteria-name-row">
                      <h3>Precipitation &amp; Aridity</h3>
                      <span className="criteria-tag">mm/day</span>
                    </div>
                    <p className="criteria-subtext">Maximum annual mean precipitation threshold (NASA POWER)</p>
                  </div>
                </div>

                {/* Tactile toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={criteria.precipitationMax !== null}
                  className={`human-switch ${criteria.precipitationMax !== null ? "on" : ""}`}
                  onClick={() => {
                    change({ precipitationMax: criteria.precipitationMax !== null ? null : 0.5 });
                  }}
                  title={criteria.precipitationMax !== null ? "Disable precipitation filter" : "Enable precipitation filter"}
                >
                  <span className="human-switch-thumb" />
                </button>
              </div>

              {criteria.precipitationMax !== null ? (
                <div className="criteria-card-body">
                  <div className="criteria-readout">
                    <span>Upper Threshold:</span>
                    <strong>&le; {criteria.precipitationMax} mm/day</strong>
                  </div>

                  <div className="slider-container">
                    <div className="slider-row">
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={Math.min(criteria.precipitationMax, 5.0)}
                        onChange={e => change({ precipitationMax: Number(e.target.value) })}
                        className="human-slider"
                      />
                      <div className="slider-number-box">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.1"
                          value={criteria.precipitationMax}
                          onChange={e => change({ precipitationMax: Number(e.target.value) })}
                        />
                        <span>mm/d</span>
                      </div>
                    </div>
                    <div className="slider-ticks">
                      <span>0.1 mm (hyper-arid)</span>
                      <span>1.0 mm (arid)</span>
                      <span>5.0 mm (semi-arid)</span>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="preset-chips">
                    <span className="preset-label">Presets:</span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ precipitationMax: 0.2 })}
                    >
                      Hyper-arid (&le; 0.2)
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ precipitationMax: 0.5 })}
                    >
                      Arid (&le; 0.5)
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => change({ precipitationMax: 2.0 })}
                    >
                      Semi-arid (&le; 2.0)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="criteria-card-inactive">
                  <span>Filter inactive — click toggle to enforce maximum precipitation</span>
                </div>
              )}
            </div>

            {/* Criterion 3: Mission Purpose */}
            <div className="criteria-card active">
              <div className="criteria-card-header">
                <div className="criteria-title-group">
                  <div className="criteria-icon-box">
                    <Compass size={16} />
                  </div>
                  <div>
                    <div className="criteria-name-row">
                      <h3>Mission Objective</h3>
                      <span className="criteria-tag context-tag">Context</span>
                    </div>
                    <p className="criteria-subtext">Select operational focus for analog candidate evaluation</p>
                  </div>
                </div>
              </div>

              <div className="criteria-card-body">
                <div className="mission-grid">
                  {[
                    { id: "rover", label: "Rover Mobility", desc: "Chassis, wheels & locomotion in loose regolith" },
                    { id: "geology", label: "Geology Fieldwork", desc: "Basalt, mineral spectroscopy & rock sampling" },
                    { id: "habitat", label: "Extreme Habitat", desc: "Isolation, life support & shelter simulation" },
                    { id: "general", label: "General Exploration", desc: "Broad planetary environmental screening" },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`mission-tile ${criteria.mission === item.id ? "selected" : ""}`}
                      onClick={() => change({ mission: item.id as Criteria["mission"] })}
                    >
                      <div className="mission-tile-head">
                        <strong>{item.label}</strong>
                        {criteria.mission === item.id && <Check size={14} className="tile-check" />}
                      </div>
                      <small>{item.desc}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Criterion 4: AI Mission Assistant */}
            <div className="criteria-card ai-assistant-card">
              <div className="criteria-card-header">
                <div className="criteria-title-group">
                  <div className="criteria-icon-box ai-icon-box">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="criteria-name-row">
                      <h3>AI Mission Assistant</h3>
                      <span className="criteria-tag ai-tag">Natural Language</span>
                    </div>
                    <p className="criteria-subtext">Describe your mission goals in plain words to auto-configure criteria</p>
                  </div>
                </div>
              </div>

              <div className="criteria-card-body">
                <div className="ai-input-wrapper">
                  <textarea
                    rows={2}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="e.g. Extreme freezing dry desert below 0°C with minimal rainfall for rover wheel trials..."
                  />
                  <button
                    type="button"
                    className="ai-apply-btn"
                    disabled={interpreting || query.trim().length < 8}
                    onClick={interpret}
                  >
                    {interpreting ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
                    <span>{interpreting ? "Extracting parameters…" : "Apply Mission Prompt"}</span>
                  </button>
                </div>

                {aiMessage && <div className="ai-feedback-banner">{aiMessage}</div>}
                {unsupported.length > 0 && (
                  <div className="ai-warning-banner">
                    Requested parameters without numerical layers: {unsupported.join(", ")}
                  </div>
                )}
              </div>
            </div>

            {/* Planned Scientific Layers (Collapsible roadmap) */}
            <div className="roadmap-drawer">
              <button
                type="button"
                className="roadmap-toggle"
                onClick={() => setShowRoadmap(!showRoadmap)}
              >
                <span>
                  <Layers size={14} /> Planned Planetary Raster Layers ({unavailable.length})
                </span>
                <ChevronDown size={14} className={showRoadmap ? "rotate-180" : ""} />
              </button>
              {showRoadmap && (
                <div className="roadmap-content">
                  <p className="roadmap-intro">
                    The following planetary datasets are available as visual references, with calibrated numerical filtering planned for future releases:
                  </p>
                  <div className="roadmap-list">
                    {unavailable.map(item => (
                      <div key={item.id} className="roadmap-item">
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                <em>No active thresholds · All candidates evaluated</em>
              )}
            </div>
            {error && <p className="filter-error">{error}</p>}
            <button
              className="search-action"
              disabled={searching}
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
