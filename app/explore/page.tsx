"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Rocket } from "lucide-react";
import { useExplorer } from "@/components/ExplorerProvider";
import PlanetGlobe from "@/components/PlanetGlobe";
import { inSurvey, PlanetMap, SURVEYS } from "@/components/PlanetMap";
import { cellKey, coordinates, METRICS, metricLabel, sciencePost, scienceRequest, type Comparison, type EarthRegion, type Interpretation, type PlanetCell } from "@/lib/science-api";
import type { Planet } from "@/lib/types";

const categories = ["Surface and geology", "Temperature", "Water and resources", "Atmospheric processes", "Habitability", "Subsurface", "Operations"];
type Range = { min: string; max: string; minExclusive?: boolean; maxExclusive?: boolean; hidden?: boolean };
type Filters = Record<string, Range>;

export default function ExplorePage() {
  const { planet, selectPlanet } = useExplorer();
  const [switching, setSwitching] = useState(false);
  async function choose(next: Planet, button: HTMLButtonElement) {
    if (switching || next === planet) return;
    setSwitching(true);
    const box = button.getBoundingClientRect();
    try { await selectPlanet(next, { x: box.x + box.width / 2, y: box.y + box.height / 2 }); }
    finally { setSwitching(false); }
  }
  return <main className="atlas-page explore-page">
    <header className="atlas-heading">
      <div><h1>{planet === "mars" ? "Mars" : "Moon"} Surface Explorer</h1><p>Filter measured terrain, then select a cell to find its Earth analogs.</p></div>
      <div className="segmented" aria-label="Planet"><button type="button" disabled={switching} aria-pressed={planet === "mars"} onClick={event => choose("mars", event.currentTarget)}>Mars</button><button type="button" disabled={switching} aria-pressed={planet === "moon"} onClick={event => choose("moon", event.currentTarget)}>Moon</button></div>
    </header>
    <Explorer key={planet} planet={planet} />
  </main>;
}

function Explorer({ planet }: { planet: Planet }) {
  const router = useRouter();
  const { selected, setSelected, saveComparison } = useExplorer();
  const target = selected?.body === planet ? selected : null;
  const [cells, setCells] = useState<PlanetCell[]>([]);
  const [regions, setRegions] = useState<EarthRegion[]>([]);
  const [surveyId, setSurveyId] = useState(() => target ? SURVEYS[planet].find(item => inSurvey(target, item))?.id ?? "" : "");
  const [filters, setFilters] = useState<Filters>({});
  const [tab, setTab] = useState<"manual" | "query">("manual");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<string[]>([]);
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<"compare" | "interpret" | null>(null);
  const [error, setError] = useState("");
  const [departing, setDeparting] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const init = { signal: controller.signal };
    scienceRequest<{ features: { properties: PlanetCell }[] }>(`overlays?body=${planet}`, init).then(data => {
      setCells(data.features.map(row => row.properties));
    }).catch((cause: Error) => {
      if (!controller.signal.aborted) setLoadError(cause.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    scienceRequest<EarthRegion[]>("regions", init).then(setRegions).catch(() => {});
    return () => controller.abort();
  }, [planet, retry]);

  useEffect(() => {
    if (!departing) return;
    const timeout = window.setTimeout(() => router.push("/results"), 1080);
    return () => window.clearTimeout(timeout);
  }, [departing, router]);

  const active = Object.entries(filters).filter(([, value]) => !value.hidden && (value.min !== "" || value.max !== ""));
  const invalid = active.some(([, value]) => value.min !== "" && value.max !== "" &&
    (Number(value.min) > Number(value.max) || Number(value.min) === Number(value.max) && (value.minExclusive || value.maxExclusive)));
  const matchCounts = new Map(cells.map(cell => [cellKey(cell), invalid ? -1 : active.filter(([id, range]) => {
    const value = cell.measurements.find(row => row.feature === id)?.value;
    return value !== undefined && (range.min === "" || (range.minExclusive ? value > Number(range.min) : value >= Number(range.min)))
      && (range.max === "" || (range.maxExclusive ? value < Number(range.max) : value <= Number(range.max)));
  }).length]));
  const matching = cells.filter(cell => matchCounts.get(cellKey(cell)) === active.length);
  const matches = new Set(matching.map(cellKey));
  const survey = SURVEYS[planet].find(item => item.id === surveyId);
  const surveyCells = survey ? cells.filter(cell => inSurvey(cell, survey)) : [];
  const targetMatches = !target || !active.length || matches.has(cellKey(target));
  const world = planet === "mars" ? "Mars" : "Moon";

  function changeSurvey(id: string) {
    setSurveyId(id);
    setSelected(null);
    setError("");
  }

  function updateFilter(id: string, edge: "min" | "max", value: string) {
    setFilters(current => ({ ...current, [id]: { ...(current[id] ?? { min: "", max: "" }), [edge]: value, [`${edge}Exclusive`]: false, hidden: false } }));
  }

  async function interpret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = new AbortController();
    pending.current = controller;
    setBusy("interpret");
    setError("");
    setReview([]);
    try {
      const data = await scienceRequest<Interpretation>("interpret", sciencePost({ query, target: { body: planet } }, controller.signal));
      const next: Filters = {};
      const ignored = new Set<string>();
      for (const objective of data.mission?.objectives ?? []) {
        for (const criterion of objective.constraints) {
          if (!METRICS.some(metric => metric.id === criterion.feature)) { ignored.add(metricLabel(criterion.feature)); continue; }
          const current = next[criterion.feature] ?? { min: "", max: "" };
          if (criterion.min !== null && (current.min === "" || criterion.min >= Number(current.min))) {
            current.minExclusive = criterion.min_exclusive || (Number(current.min) === criterion.min && current.minExclusive);
            current.min = String(criterion.min);
          }
          if (criterion.max !== null && (current.max === "" || criterion.max <= Number(current.max))) {
            current.maxExclusive = criterion.max_exclusive || (Number(current.max) === criterion.max && current.maxExclusive);
            current.max = String(criterion.max);
          }
          next[criterion.feature] = current;
        }
        for (const criterion of objective.preferences) ignored.add(metricLabel(criterion.feature));
        for (const trait of objective.traits) ignored.add(trait.replaceAll("_", " "));
      }
      const received = Object.keys(next).length;
      if (received) { setFilters(next); setTab("manual"); }
      setReview([
        received ? "Review the terrain ranges before searching." : "No numeric terrain limits were applied. Try ‘slope at most 12 degrees’.",
        ...(ignored.size ? [`Requires separate evidence or a numeric limit: ${Array.from(ignored).join(", ")}.`] : []),
        ...data.review,
      ]);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The query could not be interpreted.");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }

  async function search() {
    if (!target || !targetMatches || busy) return;
    const { body, bounds, source_id, samples_per_axis } = target;
    const controller = new AbortController();
    pending.current = controller;
    setBusy("compare");
    setError("");
    try {
      const filtered = scope === "kazakhstan" ? regions.filter(region => region.country === "Kazakhstan").map(region => region.id) : [];
      const result = await scienceRequest<Comparison>("compare", sciencePost({ target: { body, bounds, source_id, samples_per_axis }, regions: filtered }, controller.signal));
      saveComparison(result);
      if (!result.candidates.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) router.push("/results");
      else setDeparting(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Earth search failed.");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }

  return <div className="explorer-workspace">
    <section className="map-workspace" aria-label={`${world} map`}>
      <div className="map-toolbar">
        <label>Survey area<select value={surveyId} onChange={event => changeSurvey(event.target.value)}><option value="">Global overview</option>{SURVEYS[planet].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {survey && <label>Mapped cell<select value={target ? cellKey(target) : ""} onChange={event => setSelected(surveyCells.find(item => cellKey(item) === event.target.value) ?? null)}>
          <option value="">Select a cell</option>{surveyCells.map(item => <option key={cellKey(item)} value={cellKey(item)}>{coordinates(item.point)}{item.samples_per_axis === 7 ? " (7 × 7)" : ""}{active.length && matches.has(cellKey(item)) ? " · match" : ""}</option>)}
        </select></label>}
        <span className="map-count" aria-live="polite">{loading ? "Loading terrain…" : active.length ? `${matching.length} of ${cells.length} cells match` : `${cells.length} measured cells`}</span>
      </div>
      <PlanetMap key={`${planet}-${surveyId}`} planet={planet} cells={cells} matchCounts={matchCounts} activeFilters={active.length} selected={target} surveyId={surveyId} onSurvey={changeSurvey} onSelect={setSelected} />
      <div className="map-footer">
        <span><i className="key-measured" /> Measured {survey ? "cell" : "survey"}</span>{active.length > 0 && <span><i className="key-match" /> Meets all filters</span>}{active.length > 1 && survey && <span><i className="key-partial" /> Partial match</span>}
        <span className="map-source">{planet === "mars" ? "MOLA" : "LOLA"} terrain · Planetocentric degrees</span>
      </div>
      {loadError && <p className="notice" role="alert">{loadError} <button className="text-button" type="button" onClick={() => { setLoadError(""); setLoading(true); setRetry(value => value + 1); }}>Retry</button></p>}
      <div className="selection-strip">
        <div><h2>Selected cell</h2><p>{target ? coordinates(target.point) : "Choose a survey and select a measured cell."}</p></div>
        {target && <dl>{METRICS.map(metric => {
          const value = target.measurements.find(row => row.feature === metric.id)?.value;
          return <div key={metric.id}><dt>{metric.name}</dt><dd>{value === undefined ? "Unavailable" : `${value.toLocaleString("en", { maximumFractionDigits: 2 })} ${metric.unit}`}</dd></div>;
        })}</dl>}
      </div>
    </section>
    <aside className="condition-panel" aria-label="Scientific filters">
      <div className="panel-heading"><h2>Scientific filters</h2><span>{active.length} active</span></div>
      <div className="segmented filter-tabs" aria-label="Filter input mode"><button type="button" aria-pressed={tab === "manual"} onClick={() => setTab("manual")}>Manual filters</button><button type="button" aria-pressed={tab === "query"} onClick={() => setTab("query")}>AI query</button></div>
      {tab === "manual" ? <>
        <details className="filter-section" open><summary>Terrain and topography</summary>
          <div className="metric-filters">{METRICS.map(metric => <fieldset key={metric.id}>
            <legend>{metric.name} <small>{metric.unit}</small>{filters[metric.id] && (filters[metric.id].min || filters[metric.id].max) && <label className="filter-toggle"><input type="checkbox" aria-label={`Apply ${metric.name} filter`} checked={!filters[metric.id].hidden} onChange={event => {
              const hidden = !event.target.checked;
              setFilters(current => ({ ...current, [metric.id]: { ...current[metric.id], hidden } }));
            }} /> Apply</label>}</legend>
            <div className="range-row">{(["min", "max"] as const).map(edge => <label key={edge}><span>{edge === "min" ? filters[metric.id]?.minExclusive ? "Above" : "Min" : filters[metric.id]?.maxExclusive ? "Below" : "Max"}</span><input type="number" inputMode="decimal" aria-label={`${metric.name} ${edge === "min" ? "minimum" : "maximum"}`} step={metric.step} placeholder="Any" value={filters[metric.id]?.[edge] ?? ""} onChange={event => updateFilter(metric.id, edge, event.target.value)} /></label>)}</div>
          </fieldset>)}</div>
        </details>
        <details className="filter-section unavailable-filters"><summary>Other scientific categories</summary><p>Georeferenced measurements are unavailable for these filters.</p><ul>{categories.map(category => <li key={category}>{category}</li>)}</ul></details>
        {Object.keys(filters).length > 0 && <button type="button" className="text-button reset-filters" onClick={() => { setFilters({}); setReview([]); }}>Clear filters</button>}
      </> : <form className="query-form" onSubmit={interpret}>
        <label htmlFor="science-query">Describe your terrain criteria</label>
        <textarea id="science-query" rows={4} placeholder="Find terrain with slope at most 12 degrees" value={query} maxLength={1000} onChange={event => setQuery(event.target.value)} />
        <p>The interpreter suggests filters from English queries. Review its ranges before searching.</p>
        <button type="submit" className="secondary-action" disabled={busy !== null || query.trim().length < 2}>{busy === "interpret" ? "Interpreting…" : "Interpret query"}</button>
      </form>}
      {review.length > 0 && <div className="filter-review" role="status">{review.map(line => <p key={line}>{line}</p>)}</div>}
      <div className="search-controls">
        <label>Earth search area<select value={scope} onChange={event => setScope(event.target.value)}><option value="all">All prepared regions</option>{regions.some(region => region.country === "Kazakhstan") && <option value="kazakhstan">Kazakhstan</option>}</select></label>
        {invalid && <p className="notice" role="alert">Check the minimum and maximum values.</p>}
        {!invalid && !targetMatches && <p className="notice">The selected cell is outside the active ranges.</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary-action" type="button" disabled={!target || !targetMatches || invalid || busy !== null || departing} onClick={search}>{busy === "compare" ? <><LoaderCircle className="spin" size={17} /> Comparing terrain…</> : <>Find Earth Analogs <ArrowRight size={17} /></>}</button>
        <Link className="text-link" href="/methodology">Methods and coverage</Link>
      </div>
    </aside>
    {departing && <div className="earth-transit"><div className="transit-stage" aria-hidden="true"><Rocket size={27} className="transit-craft" /><div className="world-image transit-earth"><PlanetGlobe planet="earth" /></div></div><p role="status">Earth results ready</p><Link href="/results" className="secondary-action">Skip transition</Link></div>}
  </div>;
}
