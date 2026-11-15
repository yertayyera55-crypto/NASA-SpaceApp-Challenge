# Planetary terrain cells

The initial snapshot contained four Mars MOLA cells and 12 south-polar Moon LOLA cells extracted from numerical elevation TIFFs. The expanded regional windows below add 180 cells. The existing exact-point API and its three rows are preserved. Retrieve regional rows from `GET /api/planetary-cells?body=mars&offset=0&limit=20`. When a recommendation target intersects a cell, `planetary_context.containing_cells` returns its regional metrics separately from exact-point measurements. Cell edges use half-open bounds. The north pole is included in a cell ending at +90°, and +180° longitude is normalized to −180°.

## Reproduce the shipped cells

Install `backend/requirements-geo.txt` and run from the repository root.

```sh
python -m backend.analog_api.prepare --output backend/local/terrain.json cells \
  --official mars --bounds 18.34 77.54 18.46 77.66 --step 0.06 --samples 7
python -m backend.analog_api.prepare --output backend/local/terrain.json cells \
  --official moon --bounds -84.02 -0.24 -83.98 0.24 --step 0.04 --samples 7
```

Bounds are south, west, north, east in planetocentric degrees and east-positive longitude. Split a region crossing the antimeridian into two commands. The CLI reads small raster windows using byte ranges and limits each invocation to 400 cells. Existing cells with the same body, source, bounds and sample count are replaced. Set `ANALOG_FEATURE_OVERLAY=backend/local/terrain.json` and restart the API to publish the results. [USGS MOLA DEM](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m), [NASA south-polar LOLA DEM](https://pgda.gsfc.nasa.gov/products/90)

## How the metrics are calculated

Each cell uses the centers of a regular geographic subgrid. The extractor transforms them to the raster's native coordinates, reads the nearest pixel, applies band scale and offset, then converts elevation to meters. Cells record the number of finite elevations and passing interior slopes. Mean elevation requires 80% finite samples. Relief, roughness and slope also require at least 80% distinct valid source pixels relative to the number of requested samples.

- `elevation_m` is the mean elevation over the finite samples, referenced to the product's vertical datum.
- `local_relief_m` is sampled maximum minus sampled minimum elevation.
- `detrended_roughness_rms_m` is the RMS elevation residual after fitting a plane in local east and north meters.
- `slope_p90_deg` is the 90th percentile of the gradient magnitude converted to degrees. Central differences use geodesic distances on the body's sphere. The central sample and four neighbors must be finite. At least 80% of interior stencils must pass.

Masked pixels, points outside the raster and latitudes outside the declared product coverage are unknown. An unavailable metric is absent from `measurements` and listed in `missing`. The bundled samples all meet coverage thresholds. Grid spacing depends on latitude. These are uniformly sampled angular-cell metrics with scale-dependent relief and roughness. The catalog recommendation API treats planetary metrics as context. The [planetary analog endpoint](INTEGRATION.md#search-earth-from-a-selected-planetary-cell) compares them with Earth patches at similar ground scales.

## Import another product

1. Add a source record with a unique `source_id` and a primary product URL in `data/sources.json`.
2. Obtain a numerical single-band GeoTIFF or COG. For raw PDS products, use a GDAL-supported or mission-recommended conversion that preserves the product's NoData mask, CRS, datum and scale. Reproject products with other latitude conventions into a spherical planetocentric CRS with east-positive longitude before import.
3. Create a local manifest like the one below. Use a relative asset path next to the manifest or a stable HTTPS data URL. Use provider metadata for the frame, vertical datum, resolution, scale and coverage. Band scale and offset are applied first. Then `meters_per_unit` and `offset_m` convert the resulting elevations to meters.

```json
{
  "body": "moon",
  "source_id": "lola",
  "asset": "regional-lola-crop.tif",
  "period": "NASA LOLA adjusted south polar DEM",
  "resolution": "20 m projected pixels",
  "datum": "LOLA sphere (1737.4 km radius)",
  "frame": "Moon Mean Earth, DE421",
  "meters_per_unit": 1,
  "offset_m": 0,
  "latitude_range": [-90, -80]
}
```

```sh
python -m backend.analog_api.prepare --output backend/local/terrain.json cells \
  --manifest backend/local/lola-crop.json \
  --bounds -84.02 -0.24 -83.98 0.24 --step 0.04 --samples 7
```

The manifest example uses a local crop of the existing LOLA product. Additional products need their own source IDs and actual native metadata. Use regional bounds and a sample count consistent with raster resolution. Each cell's source frame and datum are visible in the returned measurements.

## Expanded map windows

The snapshot now provides **196 cells with all four terrain metrics**, including the original 16. It has 112 Mars cells and 84 lunar cells. The overlay route `GET /api/planetary-overlays?body=mars&limit=200` returns a polygon FeatureCollection with the cell record in each feature's properties. Coordinate order is longitude, latitude in the body's own east-positive planetocentric frame. Use a Mars or lunar map frame. The structure is GeoJSON-compatible for rendering. Its coordinates refer to the selected planetary body.

| New window | Cells | Angular cell size (latitude × longitude) | Approximate ground cell and subgrid spacing |
| --- | ---: | --- | --- |
| Jezero, Gale and western Elysium Planitia | 108 | 0.12° × 0.12° | About 7.1 km per side near the equator and 6.8 km east–west at Jezero. 11 × 11 samples roughly 620–650 m apart on a 128 pixels/degree MOLA product. |
| Haworth vicinity | 36 | 0.04° × 0.80° | About 1.21 km north–south and 1.37 km east–west. 11 × 11 samples about 110–125 m apart on 20 m LOLA pixels. |
| Nobile vicinity | 36 | 0.04° × 0.50° | About 1.21 km for both dimensions. 11 × 11 samples about 110 m apart on 20 m LOLA pixels. |

Longitude width increases at high latitude to keep lunar cell dimensions comparable on the ground. Cell footprints can overlap where the original finer Jezero grid is nested in the new regional grid. The bounds and statistic group identify the two scales. Native DEM resolution and subgrid spacing both limit slope, relief and roughness. Around the Shackleton rim an additional wide-longitude run repeatedly failed on an upstream TIFF tile read. It yielded no validated coverage for that window.

The Mars regions are anchored roughly on the mission areas, and lunar regions are near published topography reference sites. [Jezero](https://doi.org/10.1126/sciadv.abo4856), [Gale](https://doi.org/10.1002/2014JE004622), [Elysium Planitia](https://doi.org/10.1029/2020EA001248), [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/citations/20250002845)

Reproduce into a new overlay file:

```sh
python -m backend.analog_api.prepare --output backend/local/expanded.json cells --official mars --bounds 18.08 77.20 18.80 77.92 --step 0.12 --samples 11
python -m backend.analog_api.prepare --output backend/local/expanded.json cells --official mars --bounds -5.05 137.05 -4.33 137.77 --step 0.12 --samples 11
python -m backend.analog_api.prepare --output backend/local/expanded.json cells --official mars --bounds 4.12 135.36 4.84 136.08 --step 0.12 --samples 11
python -m backend.analog_api.prepare --output backend/local/expanded.json cells --official moon --bounds -86.88 -25.00 -86.64 -20.20 --step 0.04 --lon-step 0.8 --samples 11
python -m backend.analog_api.prepare --output backend/local/expanded.json cells --official moon --bounds -85.56 35.86 -85.32 38.86 --step 0.04 --lon-step 0.5 --samples 11
```
