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
      <div><h1>{planet === "mars" ? "Mars" : "Moon"} Surface Explorer</h1><p>Pick a cell on the map or filter measured terrain to find an Earth analog.</p></div>
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
    scienceRequest<{ features: { properties: PlanetCell; comparable_scale?: boolean }[] }>(`overlays?body=${planet}`, init).then(data => {
      setCells(data.features.map(row => ({ ...row.properties, comparableScale: row.comparable_scale })));
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
  const surveys = SURVEYS[planet].map(survey => {
    const measured = cells.filter(cell => inSurvey(cell, survey));
    return {
      ...survey,
      measured,
      mapOnly: measured.length > 0 && measured.every(cell => cell.comparableScale === false),
      comparableMatch: measured.find(cell => cell.comparableScale !== false && matches.has(cellKey(cell))),
    };
  });
  const survey = surveys.find(item => item.id === surveyId);
  const surveyCells = survey?.measured ?? cells;
  const localMatches = survey ? matching.filter(cell => inSurvey(cell, survey)) : matching;
  const firstComparable = localMatches.find(cell => cell.comparableScale !== false);
  const suggested = active.length && !target ? firstComparable : undefined;
  const displayedCell = target ?? suggested;
  const cellOptions = active.length ? localMatches : surveyCells;
  const targetOutsideOptions = target && active.length && !matches.has(cellKey(target));
  const targetMatches = !target || !active.length || matches.has(cellKey(target));
  const world = planet === "mars" ? "Mars" : "Moon";
  const searchArea = survey?.name ?? `prepared ${world} surveys`;
  const searchTarget = targetMatches && displayedCell?.comparableScale !== false ? displayedCell : null;

  function changeSurvey(id: string) {
    setSurveyId(id);
    setSelected(null);
    setError("");
  }

  function chooseCell(cell: PlanetCell | null) {
    if (cell) setSurveyId(SURVEYS[planet].find(item => inSurvey(cell, item))?.id ?? "");
    setSelected(cell);
    setError("");
  }

  function updateFilter(id: string, edge: "min" | "max", value: string) {
    setFilters(current => ({ ...current, [id]: { ...(current[id] ?? { min: "", max: "" }), [edge]: value, [`${edge}Exclusive`]: false, hidden: false } }));
    setError("");
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
    if (!searchTarget || invalid || busy) return;
    const { body, bounds, source_id, samples_per_axis } = searchTarget;
    const controller = new AbortController();
    pending.current = controller;
    setBusy("compare");
    setError("");
    try {
      const filtered = scope === "kazakhstan" ? regions.filter(region => region.country === "Kazakhstan").map(region => region.id) : [];
      const result = await scienceRequest<Comparison>("compare", sciencePost({ target: { body, bounds, source_id, samples_per_axis }, regions: filtered, one_per_region: true }, controller.signal));
      if (!target) chooseCell(searchTarget);
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
        <label>Survey area<select value={surveyId} onChange={event => changeSurvey(event.target.value)}><option value="">Global overview</option>{surveys.map(item => <option key={item.id} value={item.id}>{item.name}{item.mapOnly ? " · Map only" : ""}</option>)}</select></label>
        {(survey || active.length > 0) && <label>{active.length ? "Matching cell" : "Mapped cell"}<select value={displayedCell ? cellKey(displayedCell) : ""} onChange={event => chooseCell(cellOptions.find(item => cellKey(item) === event.target.value) ?? null)} disabled={!cellOptions.length && !targetOutsideOptions}>
          <option value="">{active.length && !cellOptions.length ? "No matching cells" : "Select a cell"}</option>
          {targetOutsideOptions && <option value={cellKey(target)} disabled>{coordinates(target.point)} · outside filters</option>}
          {cellOptions.map(item => <option key={cellKey(item)} value={cellKey(item)}>{coordinates(item.point)}{item.samples_per_axis === 7 ? " (7 × 7)" : ""}{item.comparableScale === false ? " · no Earth match at this scale" : ""}</option>)}
        </select></label>}
        <span className="map-count" aria-live="polite">{loading ? "Loading terrain…" : loadError ? "Terrain data unavailable" : active.length ? `${localMatches.length} of ${surveyCells.length} cells match` : `${surveyCells.length} measured cells`}</span>
      </div>
      <PlanetMap key={`${planet}-${surveyId}`} planet={planet} cells={cells} matchCounts={matchCounts} activeFilters={active.length} selected={displayedCell ?? null} surveyId={surveyId} onSurvey={changeSurvey} onSelect={chooseCell} />
      <div className="map-footer">
        <span><i className="key-measured" /> Measured {survey ? "cell" : "survey"}</span>{active.length > 0 && <span><i className="key-match" /> Meets all filters</span>}{active.length > 1 && survey && <span><i className="key-partial" /> Partial match</span>}
        <span className="map-source">{planet === "mars" ? "MOLA" : "LOLA"} terrain · Planetocentric degrees</span>
      </div>
      {loadError && <p className="notice" role="alert">{loadError} <button className="text-button" type="button" onClick={() => { setLoadError(""); setLoading(true); setRetry(value => value + 1); }}>Retry</button></p>}
      <div className="selection-strip">
        <div><h2>{suggested ? "Suggested matching cell" : "Selected cell"}</h2><p>{displayedCell ? coordinates(displayedCell.point) : "Choose a survey or enter a terrain range."}</p></div>
        {displayedCell && <dl>{METRICS.map(metric => {
          const value = displayedCell.measurements.find(row => row.feature === metric.id)?.value;
          return <div key={metric.id}><dt>{metric.name}</dt><dd>{value === undefined ? "Unavailable" : `${value.toLocaleString("en", { maximumFractionDigits: 2 })} ${metric.unit}`}</dd></div>;
        })}</dl>}
      </div>
    </section>
    <aside className="condition-panel" aria-label="Scientific filters">
      <div className="panel-heading"><h2>Scientific filters</h2><span>{active.length} active</span></div>
      <div className="segmented filter-tabs" aria-label="Filter input mode"><button type="button" aria-pressed={tab === "manual"} onClick={() => setTab("manual")}>Manual filters</button><button type="button" aria-pressed={tab === "query"} onClick={() => setTab("query")}>AI query</button></div>
      {tab === "manual" ? <>
        <p className="filter-help">Enter a minimum, a maximum, or both. Filters apply immediately to measured {world} cells in the current survey view. Leave a field blank for no limit.</p>
        <details className="filter-section" open><summary>Terrain and topography</summary>
          <div className="metric-filters">{METRICS.map(metric => {
            const values = surveyCells.flatMap(cell => {
              const value = cell.measurements.find(row => row.feature === metric.id)?.value;
              return value === undefined ? [] : [value];
            });
            const low = Math.min(...values), high = Math.max(...values);
            const format = (value: number) => value.toLocaleString("en", { maximumFractionDigits: 2 });
            return <fieldset key={metric.id} disabled={!values.length && !filters[metric.id]}>
            <legend>{metric.name} <small>{metric.unit}</small>{filters[metric.id] && (filters[metric.id].min || filters[metric.id].max) && <label className="filter-toggle"><input type="checkbox" aria-label={`Apply ${metric.name} filter`} checked={!filters[metric.id].hidden} onChange={event => {
              const hidden = !event.target.checked;
              setFilters(current => ({ ...current, [metric.id]: { ...current[metric.id], hidden } }));
            }} /> Apply</label>}</legend>
            <div className="range-row">{(["min", "max"] as const).map(edge => <label key={edge}><span>{edge === "min" ? filters[metric.id]?.minExclusive ? "Above" : "Min" : filters[metric.id]?.maxExclusive ? "Below" : "Max"}</span><input type="number" inputMode="decimal" aria-label={`${metric.name} ${edge === "min" ? "minimum" : "maximum"}`} step={metric.step} placeholder="Any" value={filters[metric.id]?.[edge] ?? ""} onChange={event => updateFilter(metric.id, edge, event.target.value)} /></label>)}</div>
            <div className="measured-range">{values.length ? <>
              <span>Measured {low === high ? format(low) : `${format(low)} to ${format(high)}`} {metric.unit}</span>
              <button type="button" className="text-button" aria-label={`Use measured ${metric.name} range`} onClick={() => {
                setFilters(current => ({ ...current, [metric.id]: { min: String(low), max: String(high) } }));
                setError("");
              }}>Use range</button>
            </> : <span>{loading ? "Loading measurements…" : "No measurements in this view"}</span>}</div>
          </fieldset>;
          })}</div>
        </details>
        <details className="filter-section unavailable-filters"><summary>Conditions without filter data</summary><p>These conditions need additional georeferenced measurements.</p><ul>{categories.map(category => <li key={category}>{category}</li>)}</ul></details>
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
        <p className="filter-help">Earth patches are ranked by how closely their terrain resembles the chosen {world} cell.</p>
        {invalid ? <p className="notice" role="alert">Check the minimum and maximum values.</p> : !loading && !loadError && <div className="filter-status">
          {survey?.mapOnly ? <>
            <p className="notice" role="status">{survey.name} has measured terrain for map filters. Earth analog search is unavailable here because the cells have no comparable Earth measurements at their scale.</p>
            {surveys.flatMap(item => {
              const alternative = item.comparableMatch;
              return alternative ? <p key={item.id}><button type="button" className="text-button" onClick={() => chooseCell(alternative)}>Use a cell in {item.name}</button></p> : [];
            })}
            {active.length > 0 && !surveys.some(item => item.comparableMatch) && <p className="filter-help">Broaden the ranges or clear filters to find a comparable cell in another survey.</p>}
          </> : active.length > 0 && !localMatches.length ? <>
            <p className="notice" role="status">No measured cells in {searchArea} meet all filters. Broaden the ranges{survey ? " or check all surveys" : ""}.</p>
            {survey && matching.length > 0 && <button type="button" className="text-button" onClick={() => changeSurvey("")}>Show matches in other surveys ({matching.length})</button>}
          </> : !targetMatches || displayedCell?.comparableScale === false ? <>
            <p className="notice" role="status">{!targetMatches ? "The selected cell is outside the active ranges." : "No prepared Earth measurements are available at this cell’s scale."}</p>
            {active.length > 0 && firstComparable && <button type="button" className="text-button" onClick={() => chooseCell(firstComparable)}>Use a matching cell</button>}
          </> : suggested ? <p className="filter-help" role="status">Search will use the suggested matching cell at {coordinates(suggested.point)}. You can choose another match.</p>
            : !searchTarget && <p className={active.length ? "notice" : "filter-help"} role="status">{active.length ? "The matching cells have no prepared Earth measurements at their scale." : "Select a measured cell or enter a terrain range to choose a search target."}</p>}
        </div>}
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary-action" type="button" disabled={!searchTarget || invalid || loading || Boolean(loadError) || busy !== null || departing} onClick={search}>{busy === "compare" ? <><LoaderCircle className="spin" size={17} /> Comparing terrain…</> : <>Find Earth Analogs <ArrowRight size={17} /></>}</button>
        <Link className="text-link" href="/methodology">Methods and coverage</Link>
      </div>
    </aside>
    {departing && <div className="earth-transit"><div className="transit-stage" aria-hidden="true"><Rocket size={27} className="transit-craft" /><div className="world-image transit-earth"><PlanetGlobe planet="earth" /></div></div><p role="status">Earth results ready</p><Link href="/results" className="secondary-action">Skip transition</Link></div>}
  </div>;
}
