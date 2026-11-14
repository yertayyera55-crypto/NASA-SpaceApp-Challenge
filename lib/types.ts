export type Planet = "mars" | "moon";

export type Criteria = {
  temperatureMin: number | null;
  temperatureMax: number | null;
  precipitationMax: number | null;
  mission: "rover" | "geology" | "habitat" | "general";
};

export type PlanetPoint = { lat: number; lon: number };

export type Measurement = {
  value: number;
  unit: string;
  source: string;
  period: string;
  resolution: string;
};

export type AnalogResult = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  temperature: Measurement | null;
  precipitation: Measurement | null;
  score: number | null;
  components: { label: string; score: number; detail: string }[];
  limitations: string[];
  sourceUrl: string;
};

export const DEFAULT_CRITERIA: Criteria = {
  temperatureMin: null,
  temperatureMax: null,
  precipitationMax: null,
  mission: "general",
};
