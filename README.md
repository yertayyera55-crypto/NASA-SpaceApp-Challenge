# FindY

FindY is a NASA Space Apps Challenge 2026 project for finding places on Earth with terrain similar to a selected site on Mars or the Moon. It pairs an interactive Next.js map with a FastAPI service and prepared terrain datasets.

## Try a search

1. Select **Start Exploring**, then choose **Mars** or **Moon**.
2. Open a surveyed area such as Jezero or Haworth. Choose a map layer, set numerical filters, and select a measured cell.
3. Choose all prepared Earth regions or **Kazakhstan**, then select **Find Earth Analogs**.
4. Browse candidates and compare slope, relief and roughness with the selected planetary cell. Each result includes sources and limitations.

## Run locally

Install [Node.js 20.9 or later](https://nodejs.org/) and [Python 3.11 or later](https://www.python.org/).

```sh
git clone https://github.com/yertayyera55-crypto/NASA-SpaceApp-Challenge.git
cd NASA-SpaceApp-Challenge
```

**macOS.** Double-click [Запустить сайт.command](./Запустить%20сайт.command). The launcher installs dependencies on first use, starts FastAPI and Next.js, and opens the site. Keep Terminal open while using the app. Press Control+C there to stop the services it started. If port 3000 is occupied, the launcher prints the port it selected.

**From a terminal.** Start FastAPI in the first terminal, from the project root.

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.analog_api.main:app --host 127.0.0.1 --port 8000
```

On Windows, use `backend\.venv\Scripts\Activate.ps1` in PowerShell to activate the environment. In a second terminal, start Next.js.

```sh
npm ci
npm run dev
```

Open the [site](http://localhost:3000) and [FastAPI docs](http://127.0.0.1:8000/docs). Next.js forwards science requests to `http://127.0.0.1:8000` by default. Set the server-side `ANALOG_API_URL` if FastAPI uses a different address. Terrain comparisons and manual filters use the bundled data without API credentials. The query interpreter uses local rules by default and supports optional Gemini credentials. [Environment and credential setup](backend/INTEGRATION.md#gemini)

## Data and coverage

- The map includes **112 Mars cells** from MOLA and **84 Moon cells** from LOLA. Terrain filters use P90 slope, mean elevation, local relief and detrended RMS roughness. The map highlights the intersection of active filters. [Planetary coverage and methods](backend/PLANETARY_GRID.md)
- Earth comparison uses Copernicus DEM terrain patches in **20 prepared windows**, including five in Kazakhstan. It compares slope, relief and roughness at similar sampling scales. Twelve narrow lunar cells lack a comparable Earth scale. [Earth coverage](backend/REGIONAL_SEARCH.md)
- Temperature, mineralogy and ice require separate evidence. The terrain score helps shortlist field candidates. Field suitability still requires independent verification. [Scientific methodology and evaluation](backend/EVALUATION.md)
- NASA GIBS and NASA SVS Blue Marble provide visual context. FindY uses the bundled overview if local satellite imagery is unavailable. [NASA SVS imagery and credits](https://svs.gsfc.nasa.gov/2915/)

## Development checks

```sh
npm run typecheck
npm run build
python -m pip install -r backend/requirements-dev.txt
python -m pytest -q backend/tests
```

With both services running, use `python3 scripts/smoke.py` to verify planet selection, filters, search and results in Chromium. The smoke test requires Playwright and Chromium. Set `BASE_URL` if Next.js uses a different address. See the [backend setup and API reference](backend/README.md) and [integration examples](backend/INTEGRATION.md).
