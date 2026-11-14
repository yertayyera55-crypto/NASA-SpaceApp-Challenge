"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Database, ExternalLink, MapPin, Thermometer, Waves } from "lucide-react";
import { useRef, useState } from "react";
import { useExplorer } from "@/components/ExplorerProvider";
import type { AnalogResult } from "@/lib/types";

function imageUrl(site: AnalogResult) {
  return `/api/earth-imagery?lat=${site.lat}&lon=${site.lon}`;
}

export default function ResultsPage() {
  const { results, planet, point, criteria, searchNote } = useExplorer();
  const [index, setIndex] = useState(0);
  const touch = useRef(0);
  const reduce = useReducedMotion();
  const result = results[index];

  if (!result) {
    return (
      <main className="results-empty">
        <p className="overline">EARTH ANALOGS</p>
        <h1>No Active Search</h1>
        <p>Select a target world and define climatological criteria to evaluate candidate Earth analog coordinates.</p>
        <Link href="/select" className="primary-action">
          Choose a World <ArrowRight size={16} />
        </Link>
      </main>
    );
  }

  const move = (direction: number) => {
    setIndex(current => (current + direction + results.length) % results.length);
  };

  return (
    <main className="results-page">
      <div className="results-heading">
        <div>
          <p className="overline">TERRESTRIAL ANALOGS / {planet.toUpperCase()} BENCHMARK</p>
          <h1>Candidate Field Sites</h1>
          <p>Ranked against selected 20-year NASA POWER climatological baselines at representative coordinate points.</p>
        </div>
        <Link href="/explore" className="back-action">
          <ArrowLeft size={15} /> Adjust Criteria
        </Link>
      </div>

      <div className="result-context">
        <span>
          PLANETARY TARGET: <b>{planet.toUpperCase()} ({point ? `${point.lat.toFixed(2)}° LAT, ${point.lon.toFixed(2)}° E` : "Whole Planet"})</b>
        </span>
        <span>
          FILTERS: <b>{[
            criteria.temperatureMin !== null || criteria.temperatureMax !== null ? "Air Temperature" : null,
            criteria.precipitationMax !== null ? "Precipitation" : null,
          ].filter(Boolean).join(" + ") || "None"}</b>
        </span>
        <span>
          MISSION: <b>{criteria.mission.toUpperCase()}</b>
        </span>
        <span className="context-note">
          Planetary position and mission focus are recorded as context; scoring is driven purely by normalized NASA POWER data.
        </span>
      </div>

      <div
        className="result-grid"
        onTouchStart={event => { touch.current = event.touches[0].clientX; }}
        onTouchEnd={event => {
          const delta = event.changedTouches[0].clientX - touch.current;
          if (Math.abs(delta) > 70) move(delta > 0 ? -1 : 1);
        }}
      >
        <div className="result-visual">
          <AnimatePresence mode="wait">
            <motion.div
              className="result-photo"
              key={result.id}
              initial={reduce ? false : { opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <img
                src={imageUrl(result)}
                alt={`NASA GIBS Blue Marble mosaic centered on ${result.name}`}
                onError={event => { event.currentTarget.style.opacity = "0"; }}
              />
              <div className="photo-grain" />
              <div className="photo-caption">
                <span>NASA GIBS / BLUE MARBLE NEXT GENERATION</span>
                <strong>{result.name}</strong>
                <small>WMS satellite mosaic · spatial visual context</small>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="photo-bottom">
            <span>
              <MapPin size={15} /> {result.lat.toFixed(2)}° N/S, {result.lon.toFixed(2)}° E/W
            </span>
            <span>REPRESENTATIVE TEST COORDINATE</span>
          </div>
        </div>

        <div className="result-information">
          <div className="result-index">
            <span>Candidate {index + 1} of {results.length}</span>
            <span>{result.country}</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={result.id}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <h2>{result.name}</h2>

              <div className="score-row">
                <div>
                  <span>RELATIVE CLIMATE SUITABILITY</span>
                  <strong>
                    {result.score ?? "—"}
                    <small>{result.score === null ? "" : " / 100"}</small>
                  </strong>
                </div>
                <p>
                  {result.score === null
                    ? "No selected numerical criteria were available to calculate a ranking."
                    : "Determined by normalized proximity to selected Earth climate intervals. This is a scientific screening tool, not a claim of complete planetary equivalence."}
                </p>
              </div>

              <div className="measurements">
                <div>
                  <Thermometer size={16} />
                  <span>ANNUAL MEAN AIR TEMP (T2M)</span>
                  <strong>{result.temperature ? `${result.temperature.value} ${result.temperature.unit}` : "Unavailable"}</strong>
                </div>
                <div>
                  <Waves size={16} />
                  <span>ANNUAL MEAN PRECIP (PRECTOTCORR)</span>
                  <strong>{result.precipitation ? `${result.precipitation.value} ${result.precipitation.unit}` : "Unavailable"}</strong>
                </div>
              </div>

              <div className="result-evidence">
                <h3>Suitability Breakdown</h3>
                {result.components.length ? (
                  result.components.map(component => (
                    <div key={component.label}>
                      <span>
                        <b>{component.label}</b>
                        <small>{component.detail}</small>
                      </span>
                      <strong>{component.score} / 100</strong>
                    </div>
                  ))
                ) : (
                  <p>No criteria components available for scoring.</p>
                )}
              </div>

              <div className="result-limitations">
                <h3>Scientific Constraints</h3>
                <ul>
                  {result.limitations.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="result-source"
              >
                <Database size={14} /> NASA POWER · 2001–2020 Point Climatology <ExternalLink size={12} />
              </a>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="result-navigation">
        <div>
          <span>EXPLORE SHORTLIST</span>
          <strong>Five Terrestrial Candidates</strong>
        </div>
        <div className="result-arrows">
          <button onClick={() => move(-1)} aria-label="Previous candidate">
            <ChevronLeft size={18} />
          </button>
          <span>{index + 1} of {results.length}</span>
          <button onClick={() => move(1)} aria-label="Next candidate">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="result-strip">
        {results.map((candidate, i) => (
          <button
            key={candidate.id}
            className={i === index ? "current" : ""}
            onClick={() => setIndex(i)}
          >
            <span>#{i + 1}</span>
            <strong>{candidate.name}</strong>
            <small>{candidate.country}</small>
            <b>{candidate.score === null ? "—" : `${candidate.score} / 100`}</b>
          </button>
        ))}
      </div>

      <p className="results-footnote">
        {searchNote}{" "}
        <Link href="/methodology">
          Methodology & Sources <ArrowRight size={12} />
        </Link>
      </p>
    </main>
  );
}
