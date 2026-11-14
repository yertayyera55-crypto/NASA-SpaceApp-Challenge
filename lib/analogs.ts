import type { AnalogResult, Criteria, Measurement } from "./types";

// These are deliberately labelled sampling points, not boundaries or claims that an
// entire region has the point's climate. More sites can be added after validation.
export const CANDIDATES = [
  { id: "ustyurt", name: "Ustyurt Plateau / Mangystau", country: "Kazakhstan", lat: 43.42, lon: 54.08 },
  { id: "betpak", name: "Betpak-Dala", country: "Kazakhstan", lat: 46.0, lon: 70.0 },
  { id: "atacama", name: "Atacama / San Pedro", country: "Chile", lat: -22.91, lon: -68.20 },
  { id: "dry-valleys", name: "McMurdo Dry Valleys", country: "Antarctica", lat: -77.5, lon: 163.0 },
  { id: "krafla", name: "Krafla volcanic area", country: "Iceland", lat: 65.73, lon: -16.78 },
] as const;

const POWER_DOCS = "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/";

type PowerResponse = {
  properties?: { parameter?: Record<string, Record<string, number>> };
  parameters?: Record<string, { units?: string }>;
};

function annualValue(data: PowerResponse, key: string): number | null {
  const values = data.properties?.parameter?.[key];
  if (!values) return null;
  const value = values.ANN ?? values.annual;
  return typeof value === "number" && Number.isFinite(value) && value > -900 ? value : null;
}

function measurement(value: number | null, unit: string): Measurement | null {
  if (value === null) return null;
  return {
    value: Math.round(value * 10) / 10,
    unit,
    source: "NASA POWER, point climatology",
    period: "2001–2020",
    resolution: "POWER model grid; value represents the nearest grid cell",
  };
}

async function fetchClimate(lat: number, lon: number) {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/climatology/point");
  url.search = new URLSearchParams({
    parameters: "T2M,PRECTOTCORR", community: "AG", longitude: String(lon),
    latitude: String(lat), format: "JSON", start: "2001", end: "2020",
  }).toString();
  try {
    const response = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return { temperature: null, precipitation: null };
    const data = await response.json() as PowerResponse;
    return {
      temperature: measurement(annualValue(data, "T2M"), "°C"),
      precipitation: measurement(annualValue(data, "PRECTOTCORR"), "mm/day"),
    };
  } catch {
    return { temperature: null, precipitation: null };
  }
}

function temperatureScore(value: number, criteria: Criteria) {
  const min = criteria.temperatureMin ?? -Infinity;
  const max = criteria.temperatureMax ?? Infinity;
  const distance = value < min ? min - value : value > max ? value - max : 0;
  return Math.max(0, 1 - distance / 15);
}

function precipitationScore(value: number, max: number) {
  return value <= max ? 1 : Math.max(0, 1 - (value - max) / 5);
}

export async function searchAnalogs(criteria: Criteria): Promise<AnalogResult[]> {
  const climates = await Promise.all(CANDIDATES.map(site => fetchClimate(site.lat, site.lon)));
  return CANDIDATES.map((site, index) => {
    const climate = climates[index];
    const components: AnalogResult["components"] = [];
    const limitations = [
      "Earth has a different atmosphere, gravity and radiation environment from Mars and the Moon.",
      "A point climatology does not characterize the whole named region.",
      "Terrain slope, rock type and soil properties are not verified in this release.",
    ];
    if (criteria.temperatureMin !== null || criteria.temperatureMax !== null) {
      if (climate.temperature) components.push({
        label: "Air temperature", score: temperatureScore(climate.temperature.value, criteria),
        detail: `${climate.temperature.value} °C annual mean vs selected range`,
      });
      else limitations.push("NASA POWER temperature unavailable for this sample point.");
    }
    if (criteria.precipitationMax !== null) {
      if (climate.precipitation) components.push({
        label: "Precipitation", score: precipitationScore(climate.precipitation.value, criteria.precipitationMax),
        detail: `${climate.precipitation.value} mm/day annual mean vs maximum ${criteria.precipitationMax} mm/day`,
      });
      else limitations.push("NASA POWER precipitation unavailable for this sample point.");
    }
    const weight = (label: string) => label === "Air temperature" ? 0.55 : 0.45;
    const total = components.reduce((sum, component) => sum + weight(component.label), 0);
    const score = total ? Math.round(components.reduce((sum, component) => sum + component.score * weight(component.label), 0) / total * 100) : null;
    return { ...site, temperature: climate.temperature, precipitation: climate.precipitation,
      score, components: components.map(c => ({ ...c, score: Math.round(c.score * 100) })),
      limitations, sourceUrl: POWER_DOCS };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
