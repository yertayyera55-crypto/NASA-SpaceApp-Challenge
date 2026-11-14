"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Layers3, MapPin, Minus, Plus, RotateCcw } from "lucide-react";
import { useExplorer } from "@/components/ExplorerProvider";
import { CANDIDATES } from "@/lib/analogs";
import type { Planet, PlanetPoint } from "@/lib/types";

type Layer = "surface" | "geology";
type Transform = { zoom: number };

export function PlanetMap({
  planet,
  point,
  onPoint,
}: {
  planet: Planet;
  point: PlanetPoint | null;
  onPoint: (point: PlanetPoint) => void;
}) {
  const { results, criteria } = useExplorer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef<{ surface?: HTMLImageElement; geology?: HTMLImageElement }>({});
  const transform = useRef<Transform>({ zoom: 1 });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [layer, setLayer] = useState<Layer>("surface");
  const [showAnalogs, setShowAnalogs] = useState(true);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [ready, setReady] = useState(false);
  const [geologyReady, setGeologyReady] = useState(false);

  const geometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const fit = Math.min(width / 2048, height / 1024);
    const widthOnCanvas = 2048 * fit * transform.current.zoom;
    const heightOnCanvas = 1024 * fit * transform.current.zoom;
    return {
      width,
      height,
      x: (width - widthOnCanvas) / 2,
      y: (height - heightOnCanvas) / 2,
      mapWidth: widthOnCanvas,
      mapHeight: heightOnCanvas,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = images.current.surface;
    const g = geometry();
    if (!canvas || !g || !image) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(g.width * dpr);
    const pixelHeight = Math.round(g.height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050c15";
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.drawImage(image, g.x, g.y, g.mapWidth, g.mapHeight);

    if (layer === "geology" && images.current.geology) {
      ctx.globalAlpha = 0.82;
      ctx.drawImage(images.current.geology, g.x, g.y, g.mapWidth, g.mapHeight);
      ctx.globalAlpha = 1;
    }

    // Coordinate grid lines
    ctx.strokeStyle = "rgba(225, 239, 249, 0.2)";
    ctx.fillStyle = "rgba(230, 242, 252, 0.75)";
    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, SFMono-Regular, monospace";

    for (let lon = -150; lon <= 150; lon += 30) {
      const x = g.x + ((lon + 180) / 360) * g.mapWidth;
      if (x < 0 || x > g.width) continue;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, g.y));
      ctx.lineTo(x, Math.min(g.height, g.y + g.mapHeight));
      ctx.stroke();
      if (g.y + 13 > 0 && g.y + 13 < g.height) ctx.fillText(`${lon}°`, x + 5, g.y + 14);
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      const y = g.y + ((90 - lat) / 180) * g.mapHeight;
      if (y < 0 || y > g.height) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, g.x), y);
      ctx.lineTo(Math.min(g.width, g.x + g.mapWidth), y);
      ctx.stroke();
      if (g.x + 7 > 0 && g.x + 7 < g.width) ctx.fillText(`${lat}°`, g.x + 7, y - 5);
    }

    // Highlight Similar Earth Analog Places on Map (Clean Cartographic Markers - No AI Laser Slop)
    const sitesToHighlight = results.length > 0
      ? results
      : CANDIDATES;

    const markerColor = planet === "mars" ? "#f05a28" : "#38bdf8";
    const markerColorMuted = planet === "mars" ? "rgba(240, 90, 40, 0.35)" : "rgba(56, 189, 248, 0.35)";
    const markerColorText = planet === "mars" ? "#ff9a6c" : "#93c5fd";

    if (showAnalogs && sitesToHighlight.length > 0) {
      for (const site of sitesToHighlight) {
        const sx = g.x + ((site.lon + 180) / 360) * g.mapWidth;
        const sy = g.y + ((90 - site.lat) / 180) * g.mapHeight;

        if (sx < 0 || sx > g.width || sy < 0 || sy > g.height) continue;

        const hasScore = "score" in site && site.score !== null;
        const scoreVal = hasScore ? (site as { score: number }).score : null;

        // Clean subtle outer ring (no laser/radar pulses)
        ctx.strokeStyle = markerColorMuted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Solid cartographic pin dot
        ctx.fillStyle = markerColor;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // White micro-core
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Minimalist callout badge with location name and score
        const badge = scoreVal !== null ? `${site.name} · ${scoreVal}%` : site.name;
        ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, 'SF Mono', monospace";
        const bw = ctx.measureText(badge).width;
        const px = sx - bw / 2 - 8;
        const py = sy - 26;

        ctx.fillStyle = "rgba(10, 12, 18, 0.92)";
        ctx.strokeStyle = markerColorMuted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px, py, bw + 16, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = markerColorText;
        ctx.fillText(badge, px + 8, py + 12.5);
      }
    }

    // Currently Selected User Coordinate Crosshair
    if (point) {
      const x = g.x + ((point.lon + 180) / 360) * g.mapWidth;
      const y = g.y + ((90 - point.lat) / 180) * g.mapHeight;
      const accent = planet === "mars" ? "#ff8b39" : "#8cd9ff";

      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 24, y); ctx.lineTo(x - 10, y);
      ctx.moveTo(x + 10, y); ctx.lineTo(x + 24, y);
      ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 10);
      ctx.moveTo(x, y + 10); ctx.lineTo(x, y + 24);
      ctx.stroke();
    }
  }, [geometry, layer, planet, point, results, criteria, showAnalogs]);

  useEffect(() => {
    transform.current = { zoom: 1 };
    setZoomLabel(1);
    setLayer("surface");
    setReady(false);
    setGeologyReady(false);

    const surface = new Image();
    const geology = new Image();

    surface.onload = () => {
      images.current.surface = surface;
      setReady(true);
      draw();
    };
    geology.onload = () => {
      images.current.geology = geology;
      setGeologyReady(true);
    };

    surface.src = `/images/${planet}.jpg`;
    geology.src = `/images/${planet}-geology.jpg`;

    return () => {
      surface.onload = null;
      geology.onload = null;
      images.current = {};
    };
  }, [planet, draw]);

  useEffect(() => {
    draw();
  }, [draw, ready, geologyReady, zoomLabel, results, showAnalogs]);

  useEffect(() => {
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  const zoom = useCallback(
    (factor: number) => {
      transform.current.zoom = Math.max(1, Math.min(5, transform.current.zoom * factor));
      setZoomLabel(transform.current.zoom);
      draw();
    },
    [draw]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.18 : 1 / 1.18);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoom]);

  function onMapClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;

    const g = geometry();
    if (!g) return;

    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;

    // Check if clicked near an analog highlight
    const sites = results.length > 0 ? results : CANDIDATES;
    if (showAnalogs) {
      for (const site of sites) {
        const sx = g.x + ((site.lon + 180) / 360) * g.mapWidth;
        const sy = g.y + ((90 - site.lat) / 180) * g.mapHeight;
        if (Math.hypot(x - sx, y - sy) < 22) {
          onPoint({ lat: site.lat, lon: site.lon });
          return;
        }
      }
    }

    const u = (x - g.x) / g.mapWidth;
    const v = (y - g.y) / g.mapHeight;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;

    onPoint({
      lat: Math.round((90 - v * 180) * 100) / 100,
      lon: Math.round((-180 + u * 360) * 100) / 100,
    });
  }

  const highlightCount = results.length > 0 ? results.length : CANDIDATES.length;

  return (
    <div className="map-root">
      <canvas
        ref={canvasRef}
        className="planet-map-canvas"
        aria-label={`${planet} equirectangular surface map. Click to select coordinates; use the scroll wheel or controls to zoom.`}
        onPointerDown={event => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={onMapClick}
      />
      {!ready && <div className="map-loading">Loading {planet} map…</div>}

      <div className="map-top-left">
        {planet === "mars" ? "MARS" : "MOON"} · EQUIRECTANGULAR MAP{" "}
        <span className="map-resolution">2048 × 1024 px</span>
      </div>

      <div className="map-top-right">
        <button
          className={layer === "surface" ? "active" : ""}
          onClick={() => setLayer("surface")}
        >
          Surface
        </button>
        <button
          className={layer === "geology" ? "active" : ""}
          onClick={() => setLayer("geology")}
        >
          <Layers3 size={14} /> Geology
        </button>
        <button
          className={showAnalogs ? "active" : ""}
          onClick={() => setShowAnalogs(s => !s)}
          title="Toggle highlight of similar Earth analog sites"
        >
          <MapPin size={13} /> {showAnalogs ? `Analogs (${highlightCount})` : "Show Analogs"}
        </button>
      </div>

      <div className="map-controls">
        <button onClick={() => zoom(1.4)} aria-label="Zoom in">
          <Plus size={18} />
        </button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">
          <Minus size={18} />
        </button>
        <button
          onClick={() => {
            transform.current = { zoom: 1 };
            setZoomLabel(1);
            draw();
          }}
          aria-label="Reset map view"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="map-crosshair">
        <Crosshair size={15} />
        <span>
          {point
            ? `${point.lat.toFixed(2)}° LAT  /  ${point.lon.toFixed(2)}° E`
            : "EARTH ANALOG GRID ACTIVE (5)"}
        </span>
      </div>

      <div className="map-credit">
        {layer === "surface"
          ? planet === "mars"
            ? "NASA Mars Trek · Viking color mosaic"
            : "NASA SVS · LROC WAC color mosaic"
          : "Project-provided geology texture · visual reference only; legend unverified"}
      </div>
    </div>
  );
}
