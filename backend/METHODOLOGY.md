# Scientific methodology

## Repository audit

The existing app contains NASA Viking and LROC display textures and two geology-preview JPEGs. These images supply visual context for the map. NASA GIBS supplies Earth imagery to the existing Next.js imagery route. The old search uses a five-point list and POWER climate means. Its Gemini route extracts single-mission filters, and the two Python scripts generate a Mars display texture and exercise the browser. The checkout initially contained no science tables, calibrated numerical rasters, trained ML weights, or standalone research documents. The backend reused the five Earth sample points and the existing POWER parameters and period.

## Catalog design

`data/sites.json`, `data/cases.json`, `data/sources.json`, and `data/features.json` are validated on startup. Cases record the site, source, study objective, location rationale, environment, experiment, target bodies and limitations. Published field observations at a site are explicit, source-linked traits. The 19 locations include 15 documented studies, covering both established analogs and terrestrial research useful for preliminary screening. The original 87 numerical rows remain intact. The expansion adds 49 climate, elevation, slope and land-cover rows at previously unmeasured points and 18 regional GLiM lithology classes. The San Pedro and regional McMurdo sample points remain separate from the published Yungay soil and University Valley stations. Kazakhstan's Aktau, Charyn and Oyyl records are screening candidates supported by sedimentology or Earth observation. Ustyurt and Betpak-Dala are inherited screening coordinates.

The API reads a versioned feature table at startup and serves it without contacting scientific data providers. Each feature includes the source, unit, time period, location, resolution, extraction method and comparability group. Absent data stay absent in the table and appear as unavailable when the API evaluates a criterion. Coordinates and group assignments identify the cited samples or study areas.

## Data connections and coverage

| Source | Access and extraction | Bundled result |
| --- | --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/) | MERRA-2 point climatology for 2001–2020. Extract annual T2M and PRECTOTCORR, annual 10 m wind and the coldest of the 12 climatological monthly T2M means. | Four values at all 12 Earth sites. Grid averages are coarse local proxies. |
| [NASA SRTMGL1](https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1.003) via [OpenTopoData](https://www.opentopodata.org/datasets/srtm/) | 81 numeric elevations per sampled region with 90 m geodesic spacing. Center elevation references EGM96. | Elevation and P90 slope at seven sites. High latitudes are beyond SRTM coverage. |
| [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/) | Extract raster samples on the same 9 × 9 grid using regional byte ranges. Elevation references EGM2008. | Seven center elevations and six P90 slopes. A tile edge at the regional Dry Valleys point limits the slope result. |
| [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access) | Read a 51 × 51 pixel native window and count the valid pixels in class 60. Require at least 90% documented class values. | Ten bare/sparse land-cover fractions. Antarctic sites are outside coverage. |
| [NASA/USGS MOLA](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m) and [NASA LOLA](https://pgda.gsfc.nasa.gov/products/90) | Read 9 × 9 native DEM windows and transform sampling coordinates within each body's own CRS. Use pixel scale/offset and geodesic spacing for the local gradient. | Two terrain measurements at each of the Mars (18.38, 77.58) and lunar south-polar (−84, 0) sample points. |
| [USGS Mars geologic map](https://pubs.usgs.gov/sim/3292/) and [USGS unified lunar geology](https://astrogeology.usgs.gov/search/map/Moon/Geology/Unified_Geologic_Map_of_the_Moon_GIS_v2/) | Query the vector feature layer at one point or intersect a locally exported polygon subset. The mapped unit symbol is a categorical feature. | Mars sample unit HNt and low-latitude Moon sample unit Im2. The south-polar point produced no usable unit from the online layer. |
| [NASA PDS MOLA](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) and [NASA PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) | Authoritative archives referenced in the catalog. The CLI uses the derived published numeric DEM products above. A compatible regional GeoTIFF crop may be supplied locally. | Raw PDS IMG parsing is outside the implementation. |
| [Copernicus ERA5-Land](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries) | Import an authenticated CDS point CSV. Convert hourly 2 m temperatures from kelvins and compute the minimum over the exported interval. | CSV logic tested with synthetic inputs. No CDS credentials or real ERA5-Land export was available for the snapshot. |
| [University Valley field study](https://doi.org/10.1017/S0954102022000025) | Curated weather-station air temperature mean and ice depth from the study and its Figure 6. | −23.4 °C and 42 cm at the published station, stored separately from POWER. |

Earth slope is the 90th percentile of central-difference gradients in the 7 × 7 interior of a 720 m square sampled at 90 m spacing. Gradients span a 180 m baseline. At least 80% of interior estimates must be valid. Near a tile edge the extractor can return elevation without slope. SRTM and Copernicus slope use the same sampling grid, but native resolution, resampling and sensor behavior can differ. Elevation across the two vertical datums should be filtered by source when precision matters. Planetary slope uses native grid spacing and a separate product-specific comparability group. Mars heights reference the MOLA areoid and lunar heights reference the 1737.4 km LOLA sphere. The lunar DEM uses the Moon Mean Earth frame.

Broad numerical context can screen sites. Published traits help characterize features unavailable in regional grids, such as basalt observations, lava cave entrances and previous EVA training. Precipitation is a climate proxy for aridity and is separate from water activity, microbial abundance and resource yield. The eight categories each expose their supported features and category-specific limitations. Operational readiness, mineral abundances, cave continuity, local dust flux, resources in place, and planetary weather at selected points require additional evidence.

### Rebuild regional features

Install `backend/requirements-geo.txt` and run from the repository root. These commands write a local overlay. Use one preparation process per output file to avoid concurrent updates. Set `ANALOG_FEATURE_OVERLAY=backend/local/features.json` and restart FastAPI to load it.

```sh
python -m backend.analog_api.prepare --output backend/local/features.json earth --products power srtm worldcover
python -m backend.analog_api.prepare --output backend/local/features.json earth --products copernicus-dem --sites holuhraun krafla yungay university-valley dry-valleys haughton cinder-lake
python -m backend.analog_api.prepare --output backend/local/features.json planet mars 18.38 77.58 --official-dem --official-geology
python -m backend.analog_api.prepare --output backend/local/features.json planet moon -84 0 --official-dem
python -m backend.analog_api.prepare --output backend/local/features.json planet moon 0.67408 23.47297 --official-geology
```

Regional numeric GeoTIFFs of the same products can be supplied with `--dem` if an upstream server rejects range reads. Use north-up, georeferenced, single-band rasters with values in meters. The Moon adapter uses the 20 m LOLA product covering 80–90°S. Mars uses the 128 pixels-per-degree MOLA product. For geology, use `--geology path/to/units.geojson --unit-field FIELD` to supply a regional vector export in east-positive planetocentric degrees, with longitudes in [−180, 180], polygons split at the antimeridian and the correct underlying unit field. The CLI accepts only one unambiguous unit at a point.

For ERA5-Land, request 2 m temperature and an explicit UTC interval from the CDS point time-series dataset and export CSV. Supply the grid-cell coordinates of the export. The importer expects `valid_time` or `time` and `t2m` or `2m_temperature`, with at least 24 consecutive hours and temperatures in kelvins.

```sh
python -m backend.analog_api.prepare --output backend/local/features.json era5 aktau backend/local/era5-aktau.csv 44.0 79.2
```

The [audit](AUDIT.md) verifies the provider-derived summaries and the two University Valley station values. The [planetary grid guide](PLANETARY_GRID.md) describes regional terrain metrics and import of additional numerical rasters. ERA5-Land runs only for local verified exports. An unmatched planetary query point returns unavailable features until a row has been prepared.

## Interpretation, ranking and retrieval

- The interpreter separates objectives by scientific category. Its rules extract explicit metric, comparator and supported unit combinations. Non-numeric terms can request a direction or a published trait. Review flags cover ambiguous numeric requirements, unsupported variables and conflicting intervals. Manual filters use the same Pydantic models.
- Gemini may suggest a category for text outside the rules vocabulary. The API accepts only a category and an exact source-text excerpt from Gemini. The rule-based path remains available during provider failure.
- Explicit numeric bounds are hard requirements. A measured violation excludes a site. A missing measurement or unresolved requirement leaves a candidate pending. Bounds resolve source priority deterministically unless the request names a statistic group. In particular, the University Valley station mean and the POWER grid mean describe different periods and scales.
- For directional scoring, choose the requested group or the group with the widest coverage. Map values linearly across the feature's documented engineering screening scale and clamp them to [0, 1]. A verified trait contributes 0.65, a configured rubric value. A met hard bound contributes 1. A missing criterion contributes no points and reduces coverage. Report `100 × sum(points) / count(requested criteria)` alongside `count(scored criteria) / count(requested criteria)`. Sort by coverage, then score, then stable site ID. For a category with no criteria, use its default directional feature or documented traits. A default terrain or cold objective can return feature-specific qualitative evidence if comparable numeric measurements are missing.
- The portfolio takes the top screening candidate from each objective and merges repeats. Sites can remain uncovered. Planetary terrain and geology are returned as context. Cross-body comparative matching, route feasibility, permitting and travel budgets are beyond the portfolio heuristic.
- Literature search defaults to log-TF with smoothed IDF and cosine similarity over curated case text. A locally configured frozen encoder provides optional semantic retrieval. Document-frequency counts operate on site groups and the strongest case per group is retained. Case retrieval is independent of suitability. Suitability uses the site features and evidence traits above.

### Attribution

- WorldCover derivations: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. [WorldCover 2021 v200](https://doi.org/10.5281/zenodo.7254221), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Terrain summaries produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. [Product license and citations](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).
