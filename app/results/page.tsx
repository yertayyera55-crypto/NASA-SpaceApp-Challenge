"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Database, ExternalLink, MapPin, Thermometer, Waves } from "lucide-react";
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import type { AnalogResult } from "@/lib/types";

function earthImage(site: AnalogResult) {
  const bbox = [site.lon - 3, site.lat - 1.65, site.lon + 3, site.lat + 1.65].join(",");
  const params = new URLSearchParams({ SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap", LAYERS: "BlueMarble_NextGeneration", STYLES: "", FORMAT: "image/jpeg", SRS: "EPSG:4326", BBOX: bbox, WIDTH: "1200", HEIGHT: "660" });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
}

function earthImageProxy(site: AnalogResult) {
  return `/api/earth-imagery?lat=${site.lat}&lon=${site.lon}`;
}

export default function ResultsPage() {
  const { results, planet, point, criteria, searchNote } = useExplorer();
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const result = results[index];
  if (!result) return <main className="empty-results"><div><p className="eyebrow"><span className="eyebrow-line" /> EARTH ANALOGS</p><h1>No search in this session yet.</h1><p>Choose a target world and run a comparison to see NASA POWER evidence for the candidate sites.</p><Link className="button-primary" href="/explore">Open explorer <ArrowRight size={18} /></Link></div></main>;
  const next = () => setIndex((index + 1) % results.length);
  const previous = () => setIndex((index + results.length - 1) % results.length);
  return <main className="results-page">
    <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> EXPEDITION WORKSPACE / 03</p><h1>Earth analog candidates<span className="heading-dot">.</span></h1><p>Relative ranking from available climate data at five representative sampling points.</p></div><Link className="back-link" href="/explore"><ArrowLeft size={17} /> Adjust criteria</Link></div>
    <div className="results-context"><span>ORIGIN <b>{planet.toUpperCase()}</b></span><span>POINT <b>{point ? `${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°` : "None selected"}</b></span><span>CLIMATE FILTERS <b>{[criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Temperature" : null, criteria.precipitationMax !== null ? "Precipitation" : null].filter(Boolean).join(" + ") || "None"}</b></span><span>MISSION <b>{criteria.mission}</b></span></div><p className="planetary-note">The selected planetary point is a navigation marker. It does not affect the score until verified planetary measurements are connected.</p>
    <div className="results-layout">
      <div className="results-visual"><AnimatePresence mode="wait"><motion.div className="earth-image-wrap" key={result.id} initial={reduce ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? undefined : { opacity: 0, scale: .98 }} transition={{ duration: .45 }}><img src={earthImageProxy(result)} onError={event => { event.currentTarget.hidden = true; }} alt={`NASA GIBS Blue Marble view around ${result.name}`} /><div className="earth-image-shade" /><div className="earth-image-label"><span className="small-label">NASA GIBS / BLUE MARBLE</span><strong>{result.name}</strong><span>Satellite-derived global mosaic · cartographic context only</span></div></motion.div></AnimatePresence><div className="image-controls"><span><MapPin size={16} /> Sample point {result.lat.toFixed(2)}°, {result.lon.toFixed(2)}°</span><a href={earthImage(result)} target="_blank" rel="noreferrer">Open imagery <ExternalLink size={15} /></a></div></div>
      <div className="result-detail"><div className="result-topline"><span className="small-label">CANDIDATE {String(index + 1).padStart(2, "0")} / {String(results.length).padStart(2, "0")}</span><span className="sample-badge">REPRESENTATIVE POINT</span></div><AnimatePresence mode="wait"><motion.div key={result.id} initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -15 }} transition={{ duration: .35 }}><h2>{result.name}</h2><p className="country"><MapPin size={17} /> {result.country}</p><div className="score-block"><div><span className="small-label">RELATIVE CLIMATE SUITABILITY</span><strong>{result.score === null ? "—" : result.score}<small>{result.score === null ? "" : "/100"}</small></strong></div><p>{result.score === null ? "Select temperature or precipitation criteria to calculate a score." : "Based only on the selected NASA POWER variables available for this sample point. This is not scientific accuracy."}</p></div><div className="metric-grid"><div><Thermometer size={19} /><span>ANNUAL MEAN AIR TEMP.</span><strong>{result.temperature ? `${result.temperature.value} ${result.temperature.unit}` : "Data unavailable"}</strong></div><div><Waves size={19} /><span>ANNUAL MEAN PRECIP.</span><strong>{result.precipitation ? `${result.precipitation.value} ${result.precipitation.unit}` : "Data unavailable"}</strong></div></div><div className="evidence"><h3>How the score was built</h3>{result.components.length ? result.components.map(component => <div className="evidence-row" key={component.label}><div><strong>{component.label}</strong><span>{component.detail}</span></div><b>{component.score}/100</b></div>) : <p>No score components. Climate values are shown for context.</p>}</div><div className="limitations"><h3>What this comparison cannot tell us</h3><ul>{result.limitations.map(item => <li key={item}>{item}</li>)}</ul></div><a className="source-link" href={result.sourceUrl} target="_blank" rel="noreferrer"><Database size={16} /> NASA POWER · 2001–2020 point climatology <ExternalLink size={14} /></a></motion.div></AnimatePresence></div>
    </div>
    <div className="results-bottom"><div><span className="small-label">EXPLORE THE SHORTLIST</span><h3>Five candidate field regions</h3></div><div className="results-pager"><button onClick={previous} aria-label="Previous candidate"><ChevronLeft size={20} /></button><span>{String(index + 1).padStart(2, "0")} / {String(results.length).padStart(2, "0")}</span><button onClick={next} aria-label="Next candidate"><ChevronRight size={20} /></button></div></div><div className="candidate-strip">{results.map((candidate, itemIndex) => <button key={candidate.id} className={index === itemIndex ? "current" : ""} onClick={() => setIndex(itemIndex)}><span>{String(itemIndex + 1).padStart(2, "0")}</span><strong>{candidate.name}</strong><small>{candidate.country}</small><b>{candidate.score === null ? "—" : `${candidate.score}/100`}</b></button>)}</div><p className="result-disclaimer">{searchNote} <Link href="/methodology">Read the methodology <ArrowRight size={13} /></Link></p>
  </main>;
}
