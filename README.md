# Planetary Analog Explorer

An interactive NASA Space Apps 2026 web application for exploring Mars and the Moon and comparing selected Earth field sites using transparent, reproducible climate evidence.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The Gemini key is optional; manual filters and NASA POWER search work without it. Add `GEMINI_API_KEY` to `.env.local` to enable AI interpretation. Never commit `.env.local`.

## Current scientific scope

- Mars and Moon globe textures come from NASA Viking color WMTS and NASA SVS/LROC respectively. They are cartographic imagery, not numerical science layers. Run `python3 scripts/build_mars_texture.py` if the Mars texture needs to be rebuilt from official NASA WMTS tiles.
- Earth climate measurements are fetched server-side from NASA POWER at five representative sampling points. The API route caches responses for 24 hours. Missing values are shown as unavailable.
- Relative scores use only selected available annual mean air temperature and precipitation. Terrain, geology, ice and planetary environmental matching are explicitly unavailable pending verified data integration.
- Earth previews use NASA GIBS Blue Marble through a documented WMS request.

See the in-app Methodology page for data links, units, periods, limitations and scoring rules.
