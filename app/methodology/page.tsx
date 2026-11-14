import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";

const sources = [
  {
    name: "NASA Mars Trek · Viking Color Mosaic",
    role: "Mars Cartography",
    detail: "Equirectangular global display texture (2048 × 1024 px). Used strictly for visual navigation and planetocentric coordinate selection; no numerical temperature or elevation rasters are extracted.",
    url: "https://api.nasa.gov/mars-wmts/catalog/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml",
  },
  {
    name: "NASA SVS · LROC WAC Color Mosaic",
    role: "Moon Cartography",
    detail: "Equirectangular global display texture (2048 × 1024 px) from Lunar Reconnaissance Orbiter Camera. Visual spatial reference only.",
    url: "https://svs.gsfc.nasa.gov/4720/",
  },
  {
    name: "Project-Supplied Geologic Textures",
    role: "Visual Reference Overlay",
    detail: "Mars and Moon cartographic overlays supplied with the hackathon brief. Their legends, registration, and machine-readable class mappings are unverified; they are never used to calculate numerical suitability matches.",
    url: null,
  },
  {
    name: "NASA POWER · Point Climatology API",
    role: "Earth Measurements",
    detail: "Annual mean air temperature (T2M in °C) and corrected precipitation (PRECTOTCORR in mm/day) over the 2001–2020 20-year baseline. Data represents the nearest validated POWER model grid cell to each coordinate.",
    url: "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/",
  },
  {
    name: "NASA GIBS · Blue Marble Next Generation",
    role: "Earth Spatial Context",
    detail: "EPSG:4326 Web Map Service (WMS) satellite imagery queried around each candidate terrestrial coordinate. Provides visual terrain context without influencing numerical suitability scores.",
    url: "https://nasa-gibs.github.io/gibs-api-docs/python-usage/",
  },
];

export default function MethodologyPage() {
  return (
    <main className="method-page">
      <div className="editorial-kicker">DATA SOURCES & METHODOLOGY</div>
      <h1>Evidence in View.<br /><em>Limits in Plain Sight.</em></h1>
      <p className="editorial-lede">
        Every numerical score links directly to a named, peer-reviewed scientific dataset.
        Mars and Moon maps support coordinate inspection, while verified NASA POWER Earth climatology determines candidate suitability.
      </p>

      <div className="editorial-rule" />

      <section className="method-section">
        <span>RANKING LOGIC</span>
        <div>
          <h2>Suitability Calculation Algorithm</h2>
          <p>
            For each of the five terrestrial sample points, the server queries the NASA POWER climatology service for annual mean 2-meter air temperature (T2M) and precipitation (PRECTOTCORR) across a 20-year observational baseline (2001–2020).
          </p>
          <p>
            Suitability scores are normalized from 0 to 100 based on Euclidean proximity to user-defined threshold intervals. Air temperature carries a 55% weight, and precipitation carries a 45% weight, normalized across all active variables with available data. If a service measurement is unavailable, it contributes zero weight rather than fabricating values.
          </p>
          <p>
            User-selected planetary coordinates and mission designations serve as research context; they do not arbitrarily warp climatological suitability.
          </p>
        </div>
      </section>

      <section className="method-section" id="sources">
        <span>DATA REGISTER</span>
        <div>
          <h2>Dataset Provenance & Verification</h2>
          <div className="source-register">
            {sources.map(source => (
              <div className="source-row" key={source.name}>
                <span>{source.role}</span>
                <div>
                  <h3>{source.name}</h3>
                  <p>{source.detail}</p>
                </div>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open source dataset: ${source.name}`}
                  >
                    <ExternalLink size={15} />
                  </a>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="method-section">
        <span>BOUNDARIES</span>
        <div>
          <h2>Scientific Boundaries & Limitations</h2>
          <p>
            Planetary surface maps are display mosaics, not numerical thermal or spectral rasters.
            Geology overlays are visual references without machine-readable class keys.
            No temperature, slope, elevation, ice, or mineralogical regions are highlighted or claimed until verified, calibrated numerical rasters with explicit physical units and spatial bounds are connected.
          </p>
          <p>
            Earth analog sites differ fundamentally in atmospheric pressure (101.3 kPa vs 0.6 kPa on Mars), surface gravity, radiation flux, and chemical regolith composition. These sites provide high-fidelity terrestrial operational analogs for hardware, mobility, and protocols—not identical planetary environments.
          </p>
          <Link href="/select" className="primary-action">
            Choose a World <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
