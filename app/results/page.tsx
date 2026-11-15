"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import { coordinates, metricLabel, scienceRequest, type EarthCandidate, type EarthRegion } from "@/lib/science-api";

const skippedReasons: Record<string, string> = {
  incompatible_datum: "different vertical reference",
  unsupported_feature: "comparison data unavailable",
  missing_target_measurement: "measurement missing from selected cell",
  unsupported_scale: "no Earth data at a comparable scale",
};

function locationName(candidate: EarthCandidate, regions: EarthRegion[]) {
  const region = regions.find(item => item.id === candidate.region_id);
  return region ? region.name.replace(`${region.country}, `, "").replace(/ window$/i, "") : candidate.region_id.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function SiteImage({ candidate, name }: { candidate: EarthCandidate; name: string }) {
  const [imageState, setImageState] = useState<"loading" | "ready" | "missing">("loading");
  const { lat, lon } = candidate.patch.point;
  return <figure className="earth-figure">
    <div className="earth-frame" data-image-state={imageState}>
      {/* The NASA mosaic is served by our existing image route. Its tile may be unavailable. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/earth-imagery?lat=${lat}&lon=${lon}`} alt={`Blue Marble satellite view surrounding ${name}`} onLoad={() => setImageState("ready")} onError={() => setImageState("missing")} />
      {imageState === "ready" ? <span className="earth-crosshair" aria-hidden="true" /> :
        <div className="earth-overview" role="img" aria-label={`Global Earth overview showing ${coordinates(candidate.patch.point)}`}>
          <span className="earth-marker" aria-hidden="true" style={{ left: `${(lon + 180) / 3.6}%`, top: `${(90 - lat) / 1.8}%` }} />
        </div>}
    </div>
    <figcaption><span>{coordinates(candidate.patch.point)}</span><span>{imageState === "ready" ? "NASA GIBS / Local mosaic" : "NASA SVS / Global overview"}</span></figcaption>
  </figure>;
}

export default function ResultsPage() {
  const { comparison } = useExplorer();
  const [regions, setRegions] = useState<EarthRegion[]>([]);
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const candidate = comparison?.candidates[index] ?? comparison?.candidates[0];
  const selectedIndex = candidate && comparison ? comparison.candidates.indexOf(candidate) : 0;

  useEffect(() => {
    const controller = new AbortController();
    scienceRequest<EarthRegion[]>("regions", { signal: controller.signal }).then(setRegions).catch(() => {});
    return () => controller.abort();
  }, []);

  if (!comparison) return <main className="atlas-page results-empty"><h1>Earth analogs</h1><p>Select a measured cell on Mars or the Moon to compare its terrain with Earth.</p><Link className="primary-action" href="/explore">Open the explorer</Link></main>;
  const world = comparison.target.body === "mars" ? "Mars" : "Moon";
  if (!candidate) return <main className="atlas-page results-empty"><Link className="text-link" href="/explore"><ArrowLeft size={16} /> Back to the map</Link><h1>No comparable Earth patches</h1><p>The selected {world} cell does not have enough data at a scale we can compare.</p><ul>{comparison.skipped_features.map(item => <li key={item.feature}>{metricLabel(item.feature)} ({skippedReasons[item.reason] ?? item.reason})</li>)}</ul></main>;

  const { candidates } = comparison;
  const region = regions.find(item => item.id === candidate.region_id);
  const name = locationName(candidate, regions);
  function move(direction: number) {
    setIndex((selectedIndex + direction + candidates.length) % candidates.length);
  }

  return <main className="atlas-page earth-results">
    <header className="atlas-heading"><div><h1>Earth analogs</h1><p>{world} at {coordinates(comparison.target.point)} · {comparison.compared_earth_cells} Earth patches compared</p></div><Link className="text-link" href="/explore"><ArrowLeft size={16} /> Back to the map</Link></header>
    <div className="earth-grid">
      <section className="earth-visual" aria-label="Candidate imagery and navigation" onTouchStart={event => { swipeStart.current = event.touches[0].clientX; }} onTouchCancel={() => { swipeStart.current = null; }} onTouchEnd={event => {
        if (swipeStart.current === null) return;
        const delta = event.changedTouches[0].clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(delta) > 55) move(delta > 0 ? -1 : 1);
      }}>
        <SiteImage key={candidate.patch.cell_id} candidate={candidate} name={name} />
        <div className="candidate-nav"><span>Candidate {selectedIndex + 1} of {candidates.length}</span><div><button type="button" aria-label="Previous candidate" disabled={candidates.length < 2} onClick={() => move(-1)}><ChevronLeft size={20} /></button><button type="button" aria-label="Next candidate" disabled={candidates.length < 2} onClick={() => move(1)}><ChevronRight size={20} /></button></div></div>
        <ol className="candidate-list">{candidates.map((item, position) => <li key={item.patch.cell_id}><button type="button" aria-pressed={position === selectedIndex} onClick={() => setIndex(position)}><span>{locationName(item, regions)}</span><span>{item.similarity_index.toFixed(1)}</span></button></li>)}</ol>
      </section>
      <section className="earth-details" aria-label="Selected candidate evidence" key={candidate.patch.cell_id}>
        <p className="candidate-country">{region?.country}</p><h2>{name}</h2>
        <div className="similarity"><div><span>Terrain similarity</span><strong>{candidate.similarity_index.toFixed(1)}<small> / 100</small></strong></div><p>Based on measured terrain at comparable ground scales. The site requires field verification.</p></div>
        <table className="comparison-table"><thead><tr><th scope="col">Measurement</th><th scope="col">{world}</th><th scope="col">Earth</th><th scope="col">Difference</th></tr></thead><tbody>{candidate.comparisons.map(item => {
          const unit = item.target.unit === "deg" ? "°" : ` ${item.target.unit}`;
          const format = (value: number) => `${value.toLocaleString("en", { maximumFractionDigits: 2 })}${unit}`;
          return <tr key={item.target.feature}><th scope="row">{metricLabel(item.target.feature)}</th><td>{format(item.target.value)}</td><td>{format(item.earth_value)}</td><td>{format(item.absolute_difference)}</td></tr>;
        })}</tbody></table>
        <details className="result-detail" open><summary>Scientific limitations</summary><ul>{comparison.limitations.map(line => <li key={line}>{line}</li>)}</ul>{comparison.skipped_features.length > 0 && <p>Unavailable: {comparison.skipped_features.map(item => metricLabel(item.feature)).join(", ")}.</p>}</details>
        <div className="result-sources"><h3>Data sources</h3>{comparison.sources.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.title}<ArrowUpRight size={15} /></a>)}</div>
      </section>
    </div>
  </main>;
}
