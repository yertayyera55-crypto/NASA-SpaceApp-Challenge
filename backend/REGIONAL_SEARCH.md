# Automated Earth-site discovery

Search works over 20 prepared WGS84 windows. Every request first scores the coarse cells independently for each mission objective. It then scores eligible fine cells inside the highest-ranked parents. Fine cells are preprocessed offline, so serving an automated search makes zero provider requests and needs only the base FastAPI dependencies. Existing point discovery and recommendation routes retain their request and response shapes.

## Coverage in the bundled release

Coordinates are inclusive window edges given as south, west, north, east. Cell membership uses a half-open interval to avoid double-counting known coordinates on a shared edge. These rectangular windows are geographic selections, with country labels for filtering. They are not administrative boundary masks.

| Region ID | Location | S, W, N, E | Coarse | Fine |
| --- | --- | --- | ---: | ---: |
| `ustyurt` | Western Kazakhstan plateau | 43, 53, 45, 55 | 4 | 64 |
| `betpak-dala` | Central Kazakhstan desert | 46, 69, 48, 71 | 4 | 64 |
| `ili-basin` | Southeastern Kazakhstan | 43.5, 78, 45.5, 80 | 4 | 64 |
| `atacama` | Northern Chile | −25, −70, −23, −68 | 4 | 64 |
| `iceland-highlands` | Icelandic volcanic highlands | 64, −18, 65, −16 | 2 | 32 |
| `dry-valleys` | McMurdo Dry Valleys, Antarctica | −78, 160, −77, 162 | 2 | 32 |
| `aral-east` | Eastern Aral Sea margin, Kazakhstan | 45, 61, 46, 62 | 1 | 16 |
| `balkhash-south` | Southern Lake Balkhash desert, Kazakhstan | 45, 74, 46, 75 | 1 | 16 |
| `death-valley` | Death Valley, United States | 36, −117, 37, −116 | 1 | 16 |
| `devon-island` | Western Devon Island, Canada | 75, −90, 76, −89 | 1 | 16 |
| `kangerlussuaq` | Kangerlussuaq, Greenland | 67, −51, 68, −50 | 1 | 16 |
| `uyuni` | Western Salar de Uyuni, Bolivia | −21, −68, −20, −67 | 1 | 16 |
| `namib` | Namib Sand Sea, Namibia | −25, 15, −24, 16 | 1 | 16 |
| `tassili` | Tassili n’Ajjer, Algeria | 24, 8, 25, 9 | 1 | 16 |
| `danakil` | Erta Ale and Danakil Depression, Ethiopia | 13, 40, 14, 41 | 1 | 16 |
| `qaidam` | Qaidam Basin, China | 37, 94, 38, 95 | 1 | 16 |
| `lake-eyre` | Kati Thanda–Lake Eyre, Australia | −29, 137, −28, 138 | 1 | 16 |
| `tongariro` | Tongariro volcanic zone, New Zealand | −40, 175, −39, 176 | 1 | 16 |
| `oymyakon` | Oymyakon basin, Russia | 63, 142, 64, 143 | 1 | 16 |
| `hawaii-volcanoes` | Hawaiʻi volcanic island, United States | 19, −156, 20, −155 | 1 | 16 |
| **Total** | | | **34** | **544** |

The added windows expand the range of environments sampled, including polar desert, salt basins, sand seas, high-altitude desert and volcanic terrain. These are screening windows. Their selection carries no weight in the suitability score. [NASA on Devon Island](https://www.nasa.gov/wp-content/uploads/2016/04/analog_assessment_tools.pdf), [NASA on the Namib](https://science.nasa.gov/earth/earth-observatory/namib-sand-sea-149130/), [NASA on Lake Eyre](https://science.nasa.gov/earth/earth-observatory/water-pours-into-australias-lake-eyre-154451/), [USGS on Qaidam](https://pubs.usgs.gov/gip/deserts/form/), [USGS on Kīlauea](https://www.usgs.gov/volcanoes/kilauea)

Each 1° × 1° coarse cell has 16 children of 0.25° × 0.25°. Ground widths vary with latitude. Across these windows fine cells are about 28 km north–south and 6–25 km east–west. A polygon is a search footprint. Its center is a reference coordinate and should be refined with local survey data for field planning.

The offline snapshot has **5,126** source-linked feature rows. The 578 cells include both levels. Count each geographic area once. Of the 544 fine cells, 533 pass the land screening rule.

| Source | Rows | Method and resolution |
| --- | ---: | --- |
| NASA POWER / MERRA-2 | 2,312 | 60 regional requests for T2M, corrected precipitation and 10 m wind. Provider metadata reported 2001–2025, which differs from the existing point API's requested 2001–2020. Store annual air temperature, coldest monthly mean, mean daily precipitation and mean wind from the nearest published 0.5° × 0.625° grid point. Fine children may share the same values. [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/) |
| Copernicus DEM GLO-90 | 1,156 | Regional COG overviews at 2× native nominal pixel spacing. Sample 23 × 23 or 15 × 15 subcell centers on the coarse or fine level, respectively. Report mean EGM2008 elevation and P90 central-difference slopes using WGS84 geodesic distances. Require 80% finite elevation and gradient coverage for the corresponding quantities. Stencil distances are kilometers at these search scales. [Copernicus GLO-90](https://copernicus-dem-90m.s3.amazonaws.com/readme.html) |
| ESA WorldCover 2021 | 1,088 | Geographic COGs at the native 32× overview. Sample 39 × 39 or 25 × 25 subcell centers on the coarse or fine level. Report approximate class-60 bare/sparse cover and class-80 permanent surface water if 80% of sampled classes are valid. These are sample fractions. WorldCover is absent at all 34 Antarctica cells. [ESA WorldCover](https://esa-worldcover.org/en/data-access) |
| GLiM | 570 | Dominant regional lithology at each cell center from the 0.5° map. Eight centers lack a usable map class, four near the eastern Aral Sea and four near Hawaiʻi. Regional classes can miss small outcrops. [GLiM dataset](https://doi.pangaea.de/10.1594/PANGAEA.788537) |
| SRTM | 128 additional benchmark rows | 64 cached, independent 720 m × 720 m center windows with 90 m sample spacing, delivered via OpenTopoData. Used for comparison with point discovery. The automated geographic scores use GLO-90 area metrics. [SRTM access](https://www.opentopodata.org/datasets/srtm/) |

## Run a scientific query with no coordinates

Send a text query through the existing interpreter. Review the resulting objectives, then submit them to the regional endpoint. This example requires no Gemini key.

```sh
mkdir -p backend/local
curl -sS http://127.0.0.1:8000/api/interpret -H 'Content-Type: application/json' \
  -d '{"query":"Find sites for high slope mobility testing, extreme cold testing, sedimentary outcrops and lava caves","countries":["Kazakhstan"]}' \
  > backend/local/interpretation.json
python -c 'import json; d=json.load(open("backend/local/interpretation.json")); print(json.dumps({"mission":d["mission"],"regions":["ustyurt","betpak-dala","ili-basin"],"include_documented_cells":False,"limit":3}))' \
  | curl -sS http://127.0.0.1:8000/api/discover/regions -H 'Content-Type: application/json' --data-binary @-
```

This example explicitly uses three windows to reproduce the original benchmark. Omit `regions` to search all five Kazakhstan windows. The verified HTTP response evaluated **12 coarse cells and 112 distinct fine cells**. Three objectives each evaluated 48 children, with shared cells counted once in the total. The cave objective evaluated coarse evidence and remained uncovered. The portfolio contains these distinct screening areas:

| Objective | Returned center | Cell bounds S, W, N, E | Evidence |
| --- | --- | --- | --- |
| High-slope mobility | 44.625° N, 79.875° E | 44.50, 79.75, 44.75, 80.00 | Regional P90 slope 16.988° |
| Cold screening | 47.875° N, 69.125° E | 47.75, 69.00, 48.00, 69.25 | Coldest climatological monthly mean −14.24 °C |
| Sedimentary geology | 46.125° N, 69.125° E | 46.00, 69.00, 46.25, 69.25 | GLiM `sm`, mixed sedimentary rocks |
| Lava caves | Uncovered | — | No eligible subsurface measurement |

Each returned candidate includes its geographic polygon, site midpoint, source-linked area measurements, per-objective assessments, unavailable criteria, provenance, limitations and an evidence status. `contains_documented_analog` means a documented point in this catalog falls inside that polygon. `new_screening_candidate` means no such catalog point was matched and leaves prior work elsewhere open. Publication counts never affect ranking. `include_documented_cells: false` filters known cells. The search still distinguishes a catalog flag from independent site validation.

## Search across all prepared windows

Request a higher annual mean air temperature. With both geographic filters omitted, the API compares all 20 windows. The larger refinement budget lets it examine 12 parents for this objective.

```sh
curl -sS http://127.0.0.1:8000/api/discover/regions -H 'Content-Type: application/json' \
  -d '{"mission":{"objectives":[{"category":"temperature","preferences":[{"feature":"air_temperature_mean_c","direction":"higher"}]}]},"refine_per_objective":12}'
```

This query scores 34 coarse cells and 189 eligible fine cells. Its five recommendations come from Danakil, Tassili, Hawaiʻi, Namib and Lake Eyre. The leading Danakil cell has a WGS84 center at 13.125° N, 40.375° E and a 2001–2025 NASA POWER mean air temperature of 32.38 °C. The identical query on the original six windows led with an Atacama cell at 17.37 °C. These climatologies describe the corresponding product grid points. Local temperature extremes and field suitability require separate evidence.

## API and scientific use

- `GET /api/discovery-regions` lists available regions, countries and exact bounds.
- `POST /api/discover/regions` takes the existing `mission`, optional `regions` (up to 32 IDs), optional `include_documented_cells`, `refine_per_objective` (1–16, default 3) and `limit` (1–15 per objective, default 5). An omitted region filter searches every prepared region allowed by the mission's countries. Unknown region IDs return 422. `mission.include_screening: false` selects known cells only.
- `coarse_evaluated` counts all selected coarse cells once. `fine_evaluated` counts distinct eligible children scored for at least one objective. Each objective also reports its own count and `fine_considered` before land or catalog filtering. Cross-objective evidence shown for returned candidates is supplemental and does not change refinement counts.
- Rankings use the existing category-specific physical assessment. Terrain uses slope, geology regional classifications, temperature the selected station-independent statistic, water surface cover or precipitation, atmosphere wind and cover, habitability aridity as a proxy, and operations only a supplied measurable constraint. Subsurface and operational readiness remain unavailable when they require cave, ground-ice or infrastructure data. The API supports all eight category schemas, with explicit abstentions where the data cannot answer a request.
- Missing mandatory features leave the cell pending. Missing preferences contribute zero in a fixed denominator. Scores of zero do not enter recommendations. Refinement prioritizes passing parents and can consider a coarse failure when a finer grid could show a match. Shortlists favor representing distinct parents before returning lower-ranked siblings, and the portfolio can reuse a cell when it is best for multiple objectives. This bounded search can miss a high-scoring child in an unrefined parent.
- A land screen uses a majority of non-water WorldCover samples. Where WorldCover is absent it uses GLiM or the configured Dry Valleys elevation fallback. Snow, ice, steep terrain, protected status, infrastructure and permissions still require review. Cold monthly means do not give an hourly or hardware test extreme. Water coverage does not establish potable resources or access.

## Reproduce or refresh

```sh
mkdir -p backend/local
python -m pip install -r backend/requirements-geo.txt
python -m backend.analog_api.prepare_search --output backend/local/earth_search_grid.json
ANALOG_SEARCH_GRID=backend/local/earth_search_grid.json python -m uvicorn backend.analog_api.main:app
```

The offline preparation caches raw regional POWER JSON and compressed Copernicus and WorldCover overviews in `backend/local/search-cache/`. The bundled build uses 60 regional responses and 60 cached raster overviews. The API snapshot is about 2.6 MB. A rebuilt snapshot can use a later POWER period if the provider updates it. Retain the cache for reproducibility. Change `--cache` to refresh from providers. A repeat using the same cache makes zero network calls. The configured search loads the prepared snapshot once at startup.

Use `--regions ili-basin --srtm-baseline-region ili-basin --point-output backend/local/ili-points.json` for an optional benchmark build. It reuses the existing SRTM extractor and spaces the 64 first-time requests to respect the public service limit. This optional effort is outside request-time processing.

See [evaluation results](EVALUATION.md) for the centroid and exhaustive-grid comparisons.
