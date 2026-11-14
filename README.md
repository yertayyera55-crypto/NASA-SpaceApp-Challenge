# Planetary Analog Explorer

A NASA Space Apps Challenge 2026 project. The application guides a researcher from Mars or Moon cartography to a transparent comparison of potential Earth field sites.

## Run

Node.js 20.9+ is required.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The Gemini key is optional; manual filters and NASA POWER search work without it. Set `GEMINI_API_KEY` in `.env.local` to enable AI query interpretation. Do not commit `.env.local`.

Build with `npm run typecheck` and `npm run build`. With the app running, execute `python3 scripts/smoke.py` (requires Playwright with Chromium). Set `BASE_URL` if the server uses another port.

## User journey

1. `/` is the cinematic introduction.
2. `/select` presents only Mars and Moon, with a radial wave theme transition from the chosen planet.
3. `/explore` shows a pan/zoom equirectangular map and manual or optional AI-assisted criteria.
4. `/results` ranks five Earth sampling points and shows imagery, measurements, scoring components and limitations.
5. `/methodology` documents sources, units, periods and gaps; `/about` explains the project.

## Scientific scope

- Mars surface cartography is the NASA Mars Trek Viking global color mosaic; Moon cartography is the NASA SVS LROC WAC color map. Both are 2048 × 1024 px display textures. They are not numerical temperature, elevation or geology layers.
- The two geology previews are resized from the files supplied with the brief. Their legends, registration and machine-readable class mapping are unverified. They are visual references only and do not drive filters or highlighted regions.
- Clicking the NASA basemap yields planetocentric latitude and east longitude in a -180° to +180° display convention. Selection is a map coordinate, not a local measurement.
- Earth air temperature (`T2M`, °C) and precipitation (`PRECTOTCORR`, mm/day) are read server-side from NASA POWER climatology for 2001–2020 at five representative coordinates. The nearest POWER model grid cell describes each sample point, not the whole named region.
- A relative climate suitability score uses only selected available Earth variables. The weights are 55% for temperature and 45% for precipitation, normalized over available selected values. This is a ranking for research screening, not scientific prediction accuracy or proof of planetary equivalence.
- Earth visual context comes from NASA GIBS Blue Marble Next Generation WMS. The imagery supplies no numerical site measurements.
- Planetary temperature, slope, elevation, mineralogy, ice and intersected spatial coverage remain unavailable until verified georeferenced numerical datasets with units and resolution metadata are connected. The interface does not invent glowing match areas.

NASA POWER and GIBS require network access when searching or viewing results. If a service fails, its data is shown as unavailable. The Gemini interpretation route validates structured output and never substitutes AI text for scientific measurements.

## Sources

- [NASA Mars Trek Viking color WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
- [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)
- [NASA POWER climatology API](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/)
- [NASA GIBS WMS documentation](https://nasa-gibs.github.io/gibs-api-docs/python-usage/)
