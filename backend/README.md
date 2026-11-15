# FindY Science API

FastAPI service for interpreting mission requirements and ranking terrestrial field sites. The bundled catalog works offline and contains 19 candidate locations, 15 documented studies, 154 Earth feature records, three planetary points and 196 terrain cells. The FindY frontend calls FastAPI through the Next.js `/api/science/` routes for overlays, search regions, query interpretation and terrain comparison.

## Run locally

From the repository root, with Python 3.11 or newer:

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.analog_api.main:app --host 127.0.0.1 --port 8000
```

On Windows, activate with `backend\.venv\Scripts\Activate.ps1`. Open [interactive API docs](http://127.0.0.1:8000/docs), [OpenAPI JSON](http://127.0.0.1:8000/openapi.json), or [health](http://127.0.0.1:8000/api/health).

Environment variables may be exported or loaded from `backend/.env`, the repository's `.env.local`, or the repository's `.env`, in that precedence order after shell variables. Copy `backend/.env.example` to get started. Set `GEMINI_API_KEY` to enable Gemini category suggestions for natural-language input. In that mode interpretation queries are sent to Google from the server. The model defaults to `gemini-3.8-flash` and can be set with `GEMINI_MODEL`. Manual filters and the offline interpreter work without credentials. Set `ANALOG_CORS_ORIGINS` to the exact frontend origins if the frontend dev server changes ports or hosts.

## Automated regional discovery

The offline spatial search covers 34 coarse and 544 fine cells across 20 windows. Five windows are in Kazakhstan. It evaluates a prepared geographic grid with no coordinates in the mission request. Setup, exact coverage, source methods and verified example queries are in the [regional search guide](REGIONAL_SEARCH.md).

## Frontend contract

| Method and path | Request or response |
| --- | --- |
| `POST /api/interpret` | Accepts English `query`, optional `target`, optional `countries`, and `include_screening`. Returns `mission` (nullable), `provider`, and `review`. |
| `GET /api/discovery-regions` | Lists the windows available for regional Earth discovery. |
| `POST /api/discover/regions` | Scores a coarse grid and refines selected windows into a multi-objective portfolio. |
| `POST /api/discover/planetary-analogs` | Ranks Earth patches by terrain similarity to a selected Mars or Moon overlay cell. |
| `POST /api/discover` | Samples a new Earth coordinate and compares objective-specific environmental scores. See the [discovery guide](DISCOVERY.md). |
| `POST /api/recommend` | Accepts a reviewed `mission` and optional `limit` (1–20 per objective). Returns objective results, a portfolio, uncovered objective IDs and optional planetary context. |
| `GET /api/categories` | Category names, feature/trait IDs, default screening rules and category limitations. |
| `GET /api/features` | Units, valid numerical ranges and directional screening scales keyed by feature ID. |
| `GET /api/sites?country=Kazakhstan` | Full site profiles with measurements and evidence. Supports `include_screening=false`. |
| `GET /api/sites/{site_id}` | Single profile or HTTP 404. |
| `GET /api/cases` | Curated primary-source case summaries. Join `source_id` against the source catalog. |
| `GET /api/cases/search?q=basalt%20rover` | Lexical case retrieval with source links. Supports optional `category` and `limit`. |
| `GET /api/sources` | Source metadata and access types. |
| `GET /api/planetary-overlays` | Geographic polygon FeatureCollection for Mars or Moon. Requires `body` and supports paging. |
| `GET /api/planetary-cells` | Prepared terrain cells with coverage, missing metrics and provenance. Supports `body`, `offset` and `limit`. |
| `GET /api/planetary-points` | Published or locally prepared target point rows. |
| `GET /api/health` | Catalog load status and counts. `gemini_configured` indicates key presence. |

The paths above describe FastAPI directly. For the site, Next.js forwards `/api/science/overlays`, `/api/science/regions`, `/api/science/interpret` and `/api/science/compare` to FastAPI at the server-side `ANALOG_API_URL`. The legacy Next.js `/api/interpret` and `/api/search` routes use their original request shapes. For FastAPI mission interpretation, use `target: {body, point}`, with `body` equal to `mars` or `moon` and `point` equal to `{lat, lon}` or null. Earth uses WGS84 and planetary points use planetocentric latitude and east-positive longitude. Both use longitude from −180 to 180.

```sh
curl -s http://127.0.0.1:8000/api/interpret \
  -H 'Content-Type: application/json' \
  -d '{"query":"Test rover mobility on steep slopes, basalt geology, and extreme cold","target":{"body":"mars","point":{"lat":18.38,"lon":77.58}}}'
```

Display the returned `review` and objectives for editing. An unresolved numeric or unsupported requirement can set `clarification_required: true` on its objective. After confirming the intended statistic, bounds or traits, send the corrected object with that flag cleared. Unrecognized text can produce a null mission. Copy the validated mission into `{"mission": ..., "limit": 5}` and POST it to `/api/recommend`. Manual controls produce the same mission object:

```json
{
  "mission": {
    "target": {"body": "mars", "point": {"lat": 18.38, "lon": 77.58}},
    "countries": ["Kazakhstan"],
    "include_screening": true,
    "objectives": [
      {"category": "terrain", "constraints": [{"feature": "slope_p90_deg", "min": 12}]},
      {"category": "geology", "traits": ["sedimentary_outcrops"]},
      {"category": "temperature", "preferences": [{"feature": "coldest_month_mean_air_temperature_c", "direction": "lower"}]}
    ]
  },
  "limit": 5
}
```

Map the old temperature filters to `air_temperature_mean_c` and `precipitationMax` to `mean_precipitation_mm_day`. Use `statistic_group: "power_climatology_2001_2020"` on those filters to retain the old POWER series. Rover, geology and habitat selections can map to terrain or operations, geology, and biology or temperature depending on the test. The new API requires at least one objective. Numeric bounds are inclusive by default. Set `min_exclusive` or `max_exclusive` for strict inequalities. A bound or preference may select an explicit `statistic_group` to require a specific period and methodology.

Render `recommendations`, `needs_data`, and `excluded` from each objective result. A site has a nullable `suitability_index`, a separate `data_coverage` fraction, criteria with measurement or observation details, and source references. Show the index as a screening score out of 100 alongside its coverage. The portfolio associates top-ranked sites with the objective IDs they cover. Structured validation errors return HTTP 422. See Swagger or `openapi.json` for the full schema.

## Prepare data and run tests

```sh
python -m pip install -r backend/requirements-dev.txt
python -m pytest -q backend/tests
python -m backend.analog_api.prepare --help
```

See the [frontend examples and credential guide](INTEGRATION.md), [audit of all Earth values and cases](AUDIT.md), and [planetary terrain-cell import guide](PLANETARY_GRID.md).

To enable optional semantic literature retrieval, install `requirements-semantic.txt` and set `ANALOG_EMBEDDING_MODEL` to a local Sentence Transformers model directory. This feature uses frozen model weights and needs no API key. With no model configured, search uses the lexical baseline.

See [scientific methodology](METHODOLOGY.md) for source coverage, reproduction commands and assumptions, and the [evaluation report](EVALUATION.md) for scenario results and validation gaps.
