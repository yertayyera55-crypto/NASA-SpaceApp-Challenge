# Discovering and screening unfamiliar Earth sites

The existing recommendation request still defaults to catalog scoring. Set `ranking_mode: "environmental"` in `POST /api/recommend` to assess saved coordinates using physical data. Use `POST /api/discover` for a fresh WGS84 coordinate. It prepares the data for that point, evaluates it separately for each mission objective, and returns environmental comparisons against the chosen reference catalog. The country list filters the comparison. The coordinate's jurisdiction stays unverified. The request is read-only with respect to the catalog.

```sh
curl -sS http://127.0.0.1:8000/api/discover \
  -H 'Content-Type: application/json' \
  -d '{
    "point":{"lat":43.3579,"lon":79.0870},
    "mission":{"countries":["Kazakhstan"],"objectives":[
      {"category":"terrain","constraints":[{"feature":"slope_p90_deg","min":12}]},
      {"category":"temperature","preferences":[{"feature":"coldest_month_mean_air_temperature_c","direction":"lower"}]},
      {"category":"geology","traits":["sedimentary_outcrops"]},
      {"category":"subsurface","traits":["lava_caves"]}
    ]}
  }'
```

The tested coordinate was absent from the catalog and distinct from the Charyn visitor-area screening pin. The live request returned ten product values and zero linked cases. SRTM reported a site-window P90 slope of 20.554°, while Copernicus GLO-30 reported 22.525° using the same sampling interval. POWER reported a coldest-month mean of −3.81 °C. WorldCover showed 56.52% bare/sparse cover. GLiM class `sc` indicates a regional carbonate sedimentary class. The cave objective stayed pending. The different terrain values show product sensitivity even at the same point.

## Scoring rules

- Physical products supply numerical and categorical evidence. Site name, case count, source popularity, and field observations have no weight in environmental mode. Site profiles still include linked studies when available.
- Mobility uses slope and user-defined bounds or preferences. Thermal screening uses a user-selected statistic or the coldest climatological month. Air reanalysis values characterize a coarse grid, and extreme hardware test temperatures require local or hourly observations. Terrain P90 supports scouting at the sampled 720 m scale.
- Geology uses the dominant mapped GLiM class in a 0.5° cell. Basic volcanic `vb` is a regional proxy for basalt. The sedimentary filter uses `ss`, `sm`, `sc` and `su` for siliciclastic, mixed, carbonate and unconsolidated sediment classes. Evaporites use `ev`. A map-class match contributes 0.65 rubric points. A conflicting class fails the requested regional screen, while unknown classes leave the site pending. The class describes regional materials and can miss small outcrops.
- An aeolian screen uses wind and bare/sparse cover as proxies, and an aridity screen uses low precipitation. These products cannot confirm transport rates, microbial conditions, or operational readiness. A cave or crew-operation trait stays unknown without an eligible physical criterion. Explicit demands for those traits remain pending in environmental mode.
- Missing hard bounds or unsupported requested traits yield `needs_data`. Missing numeric preferences contribute zero to the fixed denominator, lower data coverage, and appear in `missing`. A site with no eligible criteria receives no score. Numeric constraints can use a named statistic group. Directional comparisons choose a common group from reference sites and report the selected measurement. Equal scores use coverage and coordinate order for reproducibility.
- The endpoint is a point screener. A spatial search for undiscovered sites across all of Kazakhstan would require a separately defined sampling grid, source-aware filtering, and field verification.

Install `backend/requirements-geo.txt` for live SRTM, Copernicus DEM and WorldCover extraction. POWER and the bundled GLiM file work with the base dependencies. Provider outages and coverage gaps appear in `unavailable_products`. Each individual criterion can remain unavailable even if a provider returned other features. Gemini and ERA5-Land credentials are optional for this workflow.

The bundled GLiM archive is unchanged from the publisher download. SHA-256 `43b4ce3276b155d804db8ff9fb227d620b4c35015a4cf564eac4d06d2b69d88e`. Hartmann and Moosdorf, 2012, Global Lithological Map Database v1.0, CC BY 3.0. [Dataset and license](https://doi.pangaea.de/10.1594/PANGAEA.788537), [class documentation](https://doi.org/10.1029/2012GC004370)
