import type { Planet, PlanetPoint } from "@/lib/types";

export type Bounds = { south: number; west: number; north: number; east: number };
export type ScienceMeasurement = { feature: string; value: number; unit: string; source_id: string; method: string };
export type PlanetCell = {
  body: Planet;
  bounds: Bounds;
  point: PlanetPoint;
  source_id: string;
  samples_per_axis: number;
  measurements: ScienceMeasurement[];
  missing: string[];
};
export type EarthCandidate = {
  patch: { cell_id: string; point: PlanetPoint; bounds: Bounds };
  region_id: string;
  similarity_index: number;
  comparisons: { target: ScienceMeasurement; earth_value: number; absolute_difference: number }[];
};
export type Comparison = {
  status: "ranked" | "insufficient_comparable_data";
  target: PlanetCell;
  compared_earth_cells: number;
  candidates: EarthCandidate[];
  skipped_features: { feature: string; reason: string }[];
  sources: { id: string; title: string; url: string }[];
  limitations: string[];
};
export type EarthRegion = { id: string; name: string; country: string };
export type Interpretation = {
  review: string[];
  mission: { objectives: {
    category: string;
    constraints: { feature: string; min: number | null; max: number | null; min_exclusive: boolean; max_exclusive: boolean }[];
    preferences: { feature: string }[];
    traits: string[];
  }[] } | null;
};

export const METRICS = [
  { id: "slope_p90_deg", name: "Slope (P90)", unit: "°", step: 0.1 },
  { id: "elevation_m", name: "Mean elevation", unit: "m", step: 1 },
  { id: "local_relief_m", name: "Local relief", unit: "m", step: 1 },
  { id: "detrended_roughness_rms_m", name: "Roughness (RMS)", unit: "m", step: 0.1 },
] as const;

export function metricLabel(id: string) {
  return METRICS.find(metric => metric.id === id)?.name ?? id.replaceAll("_", " ");
}

export function cellKey(cell: PlanetCell) {
  const { south, west, north, east } = cell.bounds;
  return [cell.body, cell.source_id, cell.samples_per_axis, south, west, north, east].join(":");
}

export function coordinates({ lat, lon }: PlanetPoint) {
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;
}

export async function scienceRequest<T>(resource: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/science/${resource}`, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "The request could not be completed.");
  return payload;
}

export function sciencePost(body: object, signal?: AbortSignal): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal };
}
