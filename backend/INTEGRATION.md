# Next.js and credentials

Run the science API and use its origin, for example `http://127.0.0.1:8000`, from the application. The existing Next.js routes retain their original contract. A browser call to FastAPI requires its page origin in `ANALOG_CORS_ORIGINS`. Configure the exact protocol, host and port. The default allows `http://localhost:3000` and `http://127.0.0.1:3000`.

## Verified request flow

```sh
curl -sS http://127.0.0.1:8000/api/interpret \
  -H 'Content-Type: application/json' \
  -d '{
    "query":"Find terrain with slope at least 12 degrees",
    "target":{"body":"mars","point":{"lat":18.38,"lon":77.58}},
    "countries":["Kazakhstan"]
  }'
```

Response excerpt with decoder defaults omitted for readability:

```json
{
  "mission": {
    "target": {"body": "mars", "point": {"lat": 18.38, "lon": 77.58}},
    "countries": ["Kazakhstan"],
    "include_screening": true,
    "objectives": [{
      "category": "terrain",
      "description": "Find terrain with slope at least 12 degrees",
      "clarification_required": false,
      "constraints": [{"feature": "slope_p90_deg", "min": 12}],
      "preferences": [],
      "traits": []
    }]
  },
  "provider": "rules",
  "review": []
}
```

Pass the returned or reviewed `mission` to `POST /api/recommend`. The same payload works for manual controls.

```sh
curl -sS http://127.0.0.1:8000/api/recommend \
  -H 'Content-Type: application/json' \
  -d '{
    "mission":{
      "target":{"body":"mars","point":{"lat":18.38,"lon":77.58}},
      "countries":["Kazakhstan"],
      "objectives":[{"category":"terrain","constraints":[{"feature":"slope_p90_deg","min":12}]}]
    },
    "limit":1
  }'
```

Observed recommendation response excerpt:

```json
{
  "results": [{
    "objective_id": 1,
    "recommendations": [{
      "site": {"id": "aktau", "name": "Aktau Mountains sedimentary section", "country": "Kazakhstan"},
      "status": "ranked",
      "suitability_index": 100.0,
      "data_coverage": 1.0,
      "criteria": [{
        "status": "met",
        "measurement": {"feature": "slope_p90_deg", "value": 23.241, "unit": "deg", "source_id": "srtm", "value_origin": "derived"}
      }]
    }]
  }],
  "portfolio": [{"site_id": "aktau", "objective_ids": [1]}],
  "uncovered_objective_ids": [],
  "planetary_context": {
    "containing_cells": [{
      "body": "mars",
      "source_id": "mola",
      "valid_elevations": 49,
      "measurements": [
        {"feature": "elevation_m", "value": -2643.571, "unit": "m"},
        {"feature": "local_relief_m", "value": 42, "unit": "m"},
        {"feature": "detrended_roughness_rms_m", "value": 3.339, "unit": "m"},
        {"feature": "slope_p90_deg", "value": 0.998, "unit": "deg"}
      ],
      "missing": []
    }]
  }
}
```

The score of 100 indicates that the one explicit numeric bound passed. Display it with coverage and the selected criterion. The full response includes source records, excluded and pending sites, exact-point measurements, and caveats. Use `GET /api/planetary-cells?body=moon&limit=5` for regional cell overlays. Unmatched coordinates return an empty cell list. Missing evidence uses nulls, empty arrays or the appropriate `missing` list. Structurally invalid mission payloads return HTTP 422. [Interactive API docs](http://127.0.0.1:8000/docs) and [OpenAPI JSON](http://127.0.0.1:8000/openapi.json) define the full contract.

## Search Earth from a selected planetary cell

Read `GET /api/planetary-overlays?body=mars&limit=200` or `?body=moon&limit=200`. When a user selects a polygon, copy `body`, `bounds`, `source_id` and `samples_per_axis` from that feature's `properties` into the `target` field. Then send the target to `POST /api/discover/planetary-analogs`. The API resolves the cell and its measurements from the server catalog. Coordinates remain in the selected body's planetocentric frame.

```sh
curl -sS http://127.0.0.1:8000/api/discover/planetary-analogs \
  -H 'Content-Type: application/json' \
  -d '{"target":{"body":"mars","bounds":{"south":18.08,"west":77.20,"north":18.20,"east":77.32},"source_id":"mola","samples_per_axis":11},"limit":3}'
```

An optional `regions` list restricts the Earth search to IDs from `GET /api/discovery-regions`. With no region filter, the search uses candidate centers in all 20 prepared windows. By default it compares P90 slope, local relief and detrended RMS roughness. An optional `features` list selects which metrics to compare. The response lists individually skipped features in `skipped_features`. Absolute elevation is skipped because the vertical datums differ. The service returns 404 for unknown cells and `status: "insufficient_comparable_data"` with no candidates for known cells without a usable comparison.

Set `one_per_region: true` to keep the highest-scoring patch from each region before applying `limit`. The default remains patch-by-patch ranking. Each planetary overlay feature also exposes `comparable_scale`, which indicates whether the Earth snapshot contains patches at a matching scale before applying Earth region or measurement filters.

Draw each candidate's Earth polygon from `geometry` using WGS84 longitude and latitude. The candidate gives the search patch's coordinates in `patch`, the score in `similarity_index` and the planetary value, Earth value and absolute difference for each feature in `comparisons`. Use `compared_earth_cells` for the number scored before applying the display limit and `sources` for provenance. `eligible_earth_cells` counts fine land cells in the chosen geographic windows before checking patch availability and documented-site filters.

The bundled Earth snapshot contains native Copernicus GLO-90 terrain patches at three scales. The Mars scales are 3.4 × 3.5 km and 6.9 × 7.1 km. The Moon scale is 1.3 × 1.21 km. A match requires the same sample count per axis and ground dimensions within 15% on both axes. The native products still differ in pixel size and surface type. The search can compare 112 prepared Mars cells and 72 prepared Moon cells. Twelve older lunar cells have narrow footprints beyond the supported Earth scale. Use `compared_features` and `limitations` when presenting a result. Temperature, surface composition and operational safety require their own evidence. [USGS MOLA](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m), [NASA LOLA](https://pgda.gsfc.nasa.gov/products/90), [Copernicus GLO-90](https://copernicus-dem-90m.s3.amazonaws.com/readme.html)

Each feature contributes equally to the similarity index. The similarity for a feature is one minus the absolute difference divided by the largest of the two values and a floor. The floors are 1° for slope, 10 m for relief and 3 m for roughness. These rules stabilize the ratio near zero. Earth patches with incomplete values for the selected comparable metrics are excluded. The score expresses resemblance under those rules. It does not measure probability or field suitability.

In the example, the leading patch is near 13.625° N, 40.625° E in Danakil. The Martian P90 slope is 3.769° and the Earth patch's P90 slope is 3.735°. A separate request from a Haworth vicinity cell at 86.86° S, 24.6° W on the Moon returned a patch near 64.125° N, 16.625° W in Iceland.

Rebuild the Earth comparison snapshot from the repository root with the geospatial dependencies installed. The command reads and caches bounded DEM tiles and uses the same metric calculations as the planetary preparation. The API loads the snapshot at startup and compares patches offline. Set `ANALOG_TERRAIN_PATCHES` when serving a custom snapshot.

```sh
python -m backend.analog_api.prepare_terrain_patches --output backend/local/earth-terrain-patches.json
```

## Gemini

1. Create a Gemini API key in Google AI Studio.
2. Copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY` there, or inject it through the FastAPI host's secret manager. `GEMINI_MODEL` selects an available model for that key.
3. Restart FastAPI and check that `GET /api/health` shows `gemini_configured: true`. Send a POST to `/api/interpret` and check for `provider: "rules_and_gemini"`. That provider value confirms a validated provider response. If the response uses `rules`, inspect `review` and check key restrictions, model availability and quota.

The Gemini key stays with the FastAPI service. Keep it out of `NEXT_PUBLIC_*` variables, client bundles, logs and the repository. Gemini receives the interpretation text and can suggest categories. The offline rules continue to handle numeric bounds and provider failures. [Gemini API key setup](https://ai.google.dev/gemini-api/docs/api-key?hl=en)

## ERA5-Land

1. Log in to the Copernicus Climate Data Store and accept the ERA5-Land hourly point dataset licence.
2. To download in a browser, choose 2 m temperature, a single point, a date range, hourly time series and CSV. Use at least one complete UTC day. To automate the same request, install `cdsapi` in your download environment, keep your personal access token in the home-directory `.cdsapirc`, then use the code generated by **Show API request code** on the dataset download page.
3. Save the CSV in `backend/local/`. Read the rounded 0.1° grid coordinates in the export and pass them to the importer. It expects a UTC timestamp column (`valid_time` or `time`) and temperature in kelvins (`t2m` or `2m_temperature`).

```sh
python -m pip install -r backend/requirements-geo.txt
python -m backend.analog_api.prepare --output backend/local/features.json \
  era5 aktau backend/local/era5-aktau.csv 44.0 79.2
```

The grid coordinates in the command are the expected rounded values for Aktau. Use the actual grid coordinates in the downloaded file. The importer validates complete consecutive hours and computes the minimum over that interval. Set `ANALOG_FEATURE_OVERLAY=backend/local/features.json`, restart FastAPI, and inspect `GET /api/sites/aktau` for the `era5` row. CDS credentials are used for downloading, while FastAPI only reads the prepared data. Real CDS retrieval requires an authorized account. [CDS API setup](https://cds.climate.copernicus.eu/how-to-api), [ERA5-Land point data](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries)
