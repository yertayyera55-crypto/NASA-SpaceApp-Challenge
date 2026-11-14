"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Layers3, Minus, Plus, RotateCcw } from "lucide-react";
import type { Planet, PlanetPoint } from "@/lib/types";

type Layer = "surface" | "geology";
type Transform = { zoom: number; dx: number; dy: number };

export function PlanetMap({ planet, point, onPoint }: { planet: Planet; point: PlanetPoint | null; onPoint: (point: PlanetPoint) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef<{ surface?: HTMLImageElement; geology?: HTMLImageElement }>({});
  const transform = useRef<Transform>({ zoom: 1, dx: 0, dy: 0 });
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [layer, setLayer] = useState<Layer>("surface");
  const [zoomLabel, setZoomLabel] = useState(1);
  const [ready, setReady] = useState(false);
  const [geologyReady, setGeologyReady] = useState(false);

  const geometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const fit = Math.min(width / 2048, height / 1024);
    const widthOnCanvas = 2048 * fit * transform.current.zoom;
    const heightOnCanvas = 1024 * fit * transform.current.zoom;
    return { width, height, x: (width - widthOnCanvas) / 2 + transform.current.dx, y: (height - heightOnCanvas) / 2 + transform.current.dy, mapWidth: widthOnCanvas, mapHeight: heightOnCanvas };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = images.current.surface;
    const g = geometry();
    if (!canvas || !g || !image) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(g.width * dpr), pixelHeight = Math.round(g.height * dpr);
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
      ctx.globalAlpha = .82;
      ctx.drawImage(images.current.geology, g.x, g.y, g.mapWidth, g.mapHeight);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "rgba(225,239,249,.23)";
    ctx.fillStyle = "rgba(230,242,252,.77)";
    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = g.x + (lon + 180) / 360 * g.mapWidth;
      if (x < 0 || x > g.width) continue;
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, g.y)); ctx.lineTo(x, Math.min(g.height, g.y + g.mapHeight)); ctx.stroke();
      if (g.y + 13 > 0 && g.y + 13 < g.height) ctx.fillText(`${lon}°`, x + 5, g.y + 14);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = g.y + (90 - lat) / 180 * g.mapHeight;
      if (y < 0 || y > g.height) continue;
      ctx.beginPath(); ctx.moveTo(Math.max(0, g.x), y); ctx.lineTo(Math.min(g.width, g.x + g.mapWidth), y); ctx.stroke();
      if (g.x + 7 > 0 && g.x + 7 < g.width) ctx.fillText(`${lat}°`, g.x + 7, y - 5);
    }
    if (point) {
      const x = g.x + (point.lon + 180) / 360 * g.mapWidth;
      const y = g.y + (90 - point.lat) / 180 * g.mapHeight;
      const accent = planet === "mars" ? "#ff8b39" : "#8cd9ff";
      ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 24, y); ctx.lineTo(x - 10, y); ctx.moveTo(x + 10, y); ctx.lineTo(x + 24, y); ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 10); ctx.moveTo(x, y + 10); ctx.lineTo(x, y + 24); ctx.stroke();
    }
  }, [geometry, layer, planet, point]);

  useEffect(() => {
    transform.current = { zoom: 1, dx: 0, dy: 0 };
    setZoomLabel(1); setLayer("surface"); setReady(false); setGeologyReady(false);
    const surface = new Image();
    const geology = new Image();
    surface.onload = () => { images.current.surface = surface; setReady(true); draw(); };
    geology.onload = () => { images.current.geology = geology; setGeologyReady(true); };
    surface.src = `/images/${planet}.jpg`;
    geology.src = `/images/${planet}-geology.jpg`;
    return () => { surface.onload = null; geology.onload = null; images.current = {}; };
  }, [planet]);
  useEffect(() => { draw(); }, [draw, ready, geologyReady, zoomLabel]);
  useEffect(() => {
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  function zoom(factor: number) {
    transform.current.zoom = Math.max(1, Math.min(5, transform.current.zoom * factor));
    if (transform.current.zoom === 1) { transform.current.dx = 0; transform.current.dy = 0; }
    setZoomLabel(transform.current.zoom);
    draw();
  }
  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, dx: transform.current.dx, dy: transform.current.dy, moved: false };
  }
  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const deltaX = event.clientX - drag.current.x, deltaY = event.clientY - drag.current.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.current.moved = true;
    if (drag.current.moved) {
      transform.current.dx = drag.current.dx + deltaX;
      transform.current.dy = drag.current.dy + deltaY;
      draw();
    }
  }
  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (wasDrag) return;
    const g = geometry();
    if (!g) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const u = (x - g.x) / g.mapWidth, v = (y - g.y) / g.mapHeight;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    onPoint({ lat: Math.round((90 - v * 180) * 100) / 100, lon: Math.round((-180 + u * 360) * 100) / 100 });
  }
  return <div className="map-root">
    <canvas ref={canvasRef} className="planet-map-canvas" aria-label={`${planet} equirectangular surface map. Click to select coordinates; drag to pan.`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={event => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.18 : 1 / 1.18); }} />
    {!ready && <div className="map-loading">Loading {planet} map…</div>}
    <div className="map-top-left"><span className="live-dot" /> {planet === "mars" ? "MARS" : "MOON"} / EQUIRECTANGULAR MAP <span className="map-resolution">2048 × 1024 px display texture</span></div>
    <div className="map-top-right"><button className={layer === "surface" ? "active" : ""} onClick={() => setLayer("surface")}>Surface</button><button className={layer === "geology" ? "active" : ""} onClick={() => setLayer("geology")}><Layers3 size={14} /> Geology</button></div>
    <div className="map-controls"><button onClick={() => zoom(1.4)} aria-label="Zoom in"><Plus size={18} /></button><button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out"><Minus size={18} /></button><button onClick={() => { transform.current = { zoom: 1, dx: 0, dy: 0 }; setZoomLabel(1); draw(); }} aria-label="Reset map view"><RotateCcw size={16} /></button></div>
    <div className="map-crosshair"><Crosshair size={17} /><span>{point ? `${point.lat.toFixed(2)}° LAT  /  ${point.lon.toFixed(2)}° E` : "CLICK MAP TO SELECT A POINT"}</span></div>
    <div className="map-credit">{layer === "surface" ? planet === "mars" ? "NASA Mars Trek · Viking color mosaic" : "NASA SVS · LROC WAC color mosaic" : "Project-provided geology texture · visual reference only; legend unverified"}</div>
  </div>;
}
