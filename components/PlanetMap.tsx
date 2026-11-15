"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cellKey, coordinates, METRICS, type Bounds, type PlanetCell } from "@/lib/science-api";
import type { Planet, PlanetPoint } from "@/lib/types";

type Survey = { id: string; name: string; center: PlanetPoint; width: number; height: number };
export const SURVEYS: Record<Planet, Survey[]> = {
  mars: [
    { id: "jezero", name: "Jezero crater", center: { lat: 18.44, lon: 77.56 }, width: 1.05, height: 1 },
    { id: "gale", name: "Gale crater", center: { lat: -4.69, lon: 137.41 }, width: 1.05, height: 1 },
    { id: "elysium", name: "Elysium Planitia", center: { lat: 4.48, lon: 135.72 }, width: 1.05, height: 1 },
  ],
  moon: [
    { id: "haworth", name: "Haworth vicinity", center: { lat: -86.76, lon: -22.6 }, width: 5.9, height: 0.33 },
    { id: "nobile", name: "Nobile vicinity", center: { lat: -85.44, lon: 37.36 }, width: 3.7, height: 0.33 },
    { id: "polar", name: "South polar strip", center: { lat: -84, lon: 0 }, width: 0.65, height: 0.06 },
  ],
};

export function inSurvey(cell: PlanetCell, survey: Survey) {
  return Math.abs(cell.point.lon - survey.center.lon) < survey.width / 2
    && Math.abs(cell.point.lat - survey.center.lat) < survey.height / 2;
}

export function PlanetMap({ planet, cells, matchCounts, activeFilters, selected, surveyId, onSurvey, onSelect }:
  { planet: Planet; cells: PlanetCell[]; matchCounts: Map<string, number>; activeFilters: number; selected: PlanetCell | null;
    surveyId: string; onSurvey: (survey: string) => void; onSelect: (cell: PlanetCell) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [layer, setLayer] = useState(surveyId ? "slope_p90_deg" : "surface");
  const [zoom, setZoom] = useState(1);
  const survey = SURVEYS[planet].find(item => item.id === surveyId);
  const projection = useRef<((lon: number, lat: number) => [number, number]) | null>(null);
  const visibleCells = survey ? cells.filter(cell => inSurvey(cell, survey)) : cells;
  const metric = METRICS.find(item => item.id === layer);
  const valuesByCell = new Map(visibleCells.flatMap(cell => {
    const value = cell.measurements.find(item => item.feature === metric?.id)?.value;
    return value === undefined ? [] : [[cellKey(cell), value] as const];
  }));
  const values = Array.from(valuesByCell.values());
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const imagePath = `/images/${planet}${layer === "geology" ? "-geology" : ""}.jpg`;

  useEffect(() => {
    const image = new Image();
    image.onload = () => setBase(image);
    image.src = imagePath;
    return () => { image.onload = null; };
  }, [imagePath]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const drawing = element.getContext("2d");
    if (!drawing) return;
    function draw() {
      if (!element || !drawing) return;
      const ctx = drawing;
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      const style = getComputedStyle(element);
      const color = (name: string) => style.getPropertyValue(name).trim();
      element.width = Math.round(width * pixelRatio);
      element.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.fillStyle = color("--map-void");
      ctx.fillRect(0, 0, width, height);
      const margins = survey ? 25 : 28;
      const fit = Math.min((width - margins * 2) / 360, (height - margins * 2) / 180);
      const horizontal = survey ? (width - margins * 2) * zoom / survey.width : fit * zoom;
      const vertical = survey ? (height - margins * 2) * zoom / survey.height : fit * zoom;
      const center = survey?.center ?? { lat: 0, lon: 0 };
      const project = (lon: number, lat: number): [number, number] =>
        [width / 2 + (lon - center.lon) * horizontal, height / 2 - (lat - center.lat) * vertical];
      projection.current = project;
      const [mapX, mapY] = project(-180, 90);
      const [mapEndX, mapEndY] = project(180, -90);
      ctx.save();
      ctx.beginPath();
      ctx.rect(margins, margins, width - margins * 2, height - margins * 2);
      ctx.clip();
      if (base) {
        ctx.globalAlpha = survey ? metric ? .12 : .39 : .9;
        ctx.drawImage(base, mapX, mapY, mapEndX - mapX, mapEndY - mapY);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = color("--map-grid");
      ctx.lineWidth = 1;
      if (!survey) {
        for (let lon = -180; lon <= 180; lon += 30) {
          const [x] = project(lon, 0);
          ctx.beginPath(); ctx.moveTo(x, mapY); ctx.lineTo(x, mapEndY); ctx.stroke();
        }
        for (let lat = -90; lat <= 90; lat += 30) {
          const [, y] = project(0, lat);
          ctx.beginPath(); ctx.moveTo(mapX, y); ctx.lineTo(mapEndX, y); ctx.stroke();
        }
      }
      if (survey) {
        const paint = (cell: PlanetCell) => {
          const [x, y] = project(cell.bounds.west, cell.bounds.north);
          const [east, south] = project(cell.bounds.east, cell.bounds.south);
          const key = cellKey(cell);
          const matches = matchCounts.get(key) ?? 0;
          const isMatch = activeFilters > 0 && matches === activeFilters;
          const isSelected = selected && key === cellKey(selected);
          const value = valuesByCell.get(key);
          const hasValue = value !== undefined && minimum !== null && maximum !== null;
          ctx.fillStyle = color(hasValue ? "--accent" : isMatch || isSelected ? "--map-match" : matches > 0 ? "--map-partial" : "--map-cell");
          ctx.globalAlpha = hasValue ? .13 + .63 * (maximum === minimum ? .5 : (value - minimum) / (maximum - minimum)) : 1;
          if (activeFilters > 0 && hasValue && !isMatch && !isSelected) ctx.globalAlpha *= matches > 0 ? .67 : .26;
          ctx.fillRect(x, y, east - x, south - y);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color(isSelected ? "--text" : isMatch ? "--accent" : "--map-grid-strong");
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.strokeRect(x, y, east - x, south - y);
        };
        visibleCells.forEach(paint);
        if (selected && inSurvey(selected, survey)) paint(selected);
      }
      ctx.restore();
      ctx.fillStyle = color("--muted");
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      if (!survey) {
        for (const lon of [-120, -60, 0, 60, 120]) {
          const [x] = project(lon, 0);
          if (x > margins && x < width - margins) ctx.fillText(`${lon}°`, x, Math.max(17, mapY - 7));
        }
        ctx.textAlign = "right";
        for (const lat of [-60, -30, 0, 30, 60]) {
          const [, y] = project(0, lat);
          if (y > margins && y < height - margins) ctx.fillText(`${lat}°`, Math.max(margins - 3, mapX - 5), y + 4);
        }
        for (const group of SURVEYS[planet]) {
          const hasData = cells.some(cell => inSurvey(cell, group));
          if (!hasData) continue;
          const [x, y] = project(group.center.lon, group.center.lat);
          if (x < margins || x > width - margins || y < margins - 1 || y > height - margins + 1) continue;
          ctx.fillStyle = color(!activeFilters || cells.some(cell => inSurvey(cell, group) && matchCounts.get(cellKey(cell)) === activeFilters) ? "--accent" : "--muted");
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [base, planet, survey, zoom, cells, visibleCells, matchCounts, activeFilters, selected, metric, valuesByCell, minimum, maximum]);

  function click(event: React.MouseEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const project = projection.current;
    if (!project) return;
    if (!survey) {
      const group = SURVEYS[planet].find(item => {
        const [px, py] = project(item.center.lon, item.center.lat);
        return Math.hypot(px - x, py - y) < 17 && cells.some(cell => inSurvey(cell, item));
      });
      if (group) onSurvey(group.id);
      return;
    }
    const encloses = (bounds: Bounds) => {
      const [left, top] = project(bounds.west, bounds.north);
      const [right, bottom] = project(bounds.east, bounds.south);
      return x >= left && x < right && y >= top && y < bottom;
    };
    const underPointer = visibleCells.filter(item => encloses(item.bounds));
    const matching = activeFilters ? underPointer.filter(item => matchCounts.get(cellKey(item)) === activeFilters) : [];
    const comparable = matching.filter(item => item.comparableScale !== false);
    const options = comparable.length ? comparable : matching.length ? matching : underPointer;
    const cell = options.find(item => item.samples_per_axis === 7) ?? options[0];
    if (cell) onSelect(cell);
  }

  return <div className="atlas-map" data-view={survey ? "survey" : "global"}>
    <canvas ref={canvas} onClick={click} role="img" aria-label={`${planet === "mars" ? "Mars" : "Moon"} geographic map. Use the survey and cell selectors to navigate by keyboard.`} />
    <div className="map-controls">
      <button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(4, value * 1.3))}><Plus size={17} /></button>
      <button type="button" aria-label="Zoom out" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value / 1.3))}><Minus size={17} /></button>
      <button type="button" aria-label="Reset zoom" disabled={zoom === 1} onClick={() => setZoom(1)}><RotateCcw size={15} /></button>
    </div>
    <label className="map-layer">Map layer <select value={layer} onChange={event => setLayer(event.target.value)}><option value="surface">Surface</option><option value="geology">Geology preview</option>{survey && METRICS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {survey && <div className="map-caption">
      {metric && minimum !== null && maximum !== null && <span className="map-scale"><i /> {minimum.toFixed(1)}–{maximum.toFixed(1)} {metric.unit}</span>}
      <span>{coordinates(survey.center)}</span>
    </div>}
  </div>;
}
