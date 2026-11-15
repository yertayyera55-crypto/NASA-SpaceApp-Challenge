# Backend evaluation

## External-reference evaluation

The expanded catalog has 11 cases across seven geographic groups. There are no independent graded relevance labels or systematically collected negatives. No custom model was trained, and the dataset is too small and biased toward published successes for a defensible learning-to-rank experiment.

The explainable ranker remains the default. For literature retrieval the API keeps its grouped TF–IDF baseline and can use a local, frozen sentence encoder. I evaluated the cached `sentence-transformers/all-MiniLM-L6-v2` model at revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. The project did no fine-tuning, and the model weights are external to this repository. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

Run the benchmark using the five [external-source judgements](evaluation/independent_queries.json):

```sh
python -m backend.analog_api.evaluate
python -m pip install -r backend/requirements-semantic.txt
python -m backend.analog_api.evaluate --embedding-model /path/to/local/model-directory
```

Each benchmark query names a target category and independently cites a publication or site description outside the catalog. It tests one documented relevant region. Other groups remain unjudged. For each fold, the target region is excluded from fitting the lexical term weights. At search time the frozen retrieval indexes still include candidate case texts from the target region, because the retrieval task searches a known collection. Separately, the case-blind screening run removes the target region's cases, observed traits and study-derived features across all its sites. Public numerical raster and climate features remain available. The screening rules and reference queries are fixed. The benchmark rejects reused catalog URLs and duplicate target groups.

| Baseline | Documented region in top 3 | Mean reciprocal documented rank |
| --- | ---: | ---: |
| Group-held-out lexical term weights | 5/5 | 0.867 |
| Frozen MiniLM semantic retrieval | 5/5 | 0.667 |
| Case-blind suitability screening | 2/5 | 0.400 |
| Full-catalog screening comparison | 5/5 | 1.000 |

Case-blind screening recovered the cold and aridity objectives. The remaining three depended on published traits removed for the held-out group. The full-catalog result measures recovery with those traits available. The five queries and their relevance judgements were curated for this evaluation, the external sources can discuss related campaigns, and MiniLM's pretraining exposure was not audited. These metrics describe this benchmark. Independent experts must label a larger, geographically disjoint set of successful and unsuccessful candidates before rating predictive performance.

## Scenario results

| Mission | Observed result | Comparison with field evidence |
| --- | --- | --- |
| Rover mobility on steep terrain | Aktau was the top slope-screening candidate (P90 23.241°). University Valley and Yungay also ranked on low-resolution regional slopes. Holuhraun's sampled window had P90 1.710°. | Published rover fieldwork establishes Holuhraun's operational precedent. Aktau needs traverse-scale survey and access checks. [RAVEN field case](https://doi.org/10.3847/psj/ad55f4) |
| Basaltic geological analysis | Holuhraun and Krafla both scored 65 for a documented basalt observation. | Both studies document basalt. The tie reflects equivalent scores for that trait. [RAVEN analyses](https://doi.org/10.3847/psj/ad55f4), [Leirhnjúkur cave study](https://doi.org/10.3390/rs12121970) |
| Extreme cold testing | University Valley ranked first with a POWER coldest-month climatological mean of −42.39 °C. The interpreter prompted confirmation of the desired extreme statistic. | Published weather-station near-surface air averaged −23.4 °C over three years. The hourly extreme remains unavailable. [University Valley field record](https://doi.org/10.1017/S0954102022000025) |
| Astrobiology in arid environments | Yungay ranked first with evidence for aridity and a POWER mean precipitation rate of 0.02 mm/day. San Pedro appeared with lower evidence coverage for this objective. | Field investigators used Yungay to interpret soil detections under very dry conditions. [Atacama dry-limit study](https://pubmed.ncbi.nlm.nih.gov/14605363/) |
| One request for slopes, basalt and cold | Three independent objectives produced Aktau, Holuhraun and University Valley in the portfolio. | The portfolio assigned one leading candidate to each research goal. |
| Kazakhstan-only aeolian and sedimentary screens | Oyyl appeared for aeolian landforms and Aktau for sedimentary exposures. | Both are screening candidates with local evidence for the requested features. [NASA Oyyl observation](https://science.nasa.gov/earth/earth-observatory/oyyl-dune-field-kazakhstan/), [Aktau sedimentology study](https://doi.org/10.1002/dep2.34) |

Retrieval tests identify Krafla for a cave-imaging query and return one record per site group. Duplicating a published study leaves the site score and order unchanged.

## Verification

- The prior release's 38 automated tests covered all eight categories, multi-objective ranking, strict and missing bounds, source-specific constraints, Kazakhstan filtering, evidence retrieval, duplicate cases, mocked Gemini success and failure, data validation, and local geospatial parsing.
- A running Uvicorn instance returned successful responses from all catalog routes, both mission routes, OpenAPI and Swagger. Tests also covered invalid payloads, an unknown ID and planetary cell pagination. An HTTP interpretation request round-tripped into a three-site recommendation portfolio with three Mars context features. The frontend CORS preflight succeeded.
- Real provider calls supplied NASA POWER, SRTM, public Copernicus DEM and ESA WorldCover values. Byte-range requests extracted the MOLA and LOLA sample terrain. Point queries supplied the Mars and low-latitude Moon geologic units. The lunar south-polar sample has no usable geologic unit from that service.
- The previous release passed the Next.js type check, production build and legacy Playwright smoke test. This release tested the backend only.

Re-run the automated suite with `python -m pytest -q backend/tests`. The API and geospatial fixtures run without internet credentials. The [methodology](METHODOLOGY.md) contains the regional provider commands.

## Scientific validation still needed

- Independent judgments across more candidate regions, with explicit objective definitions and a record of failed or unsuitable trials.
- Ground-truth locations, survey-scale slopes and route hazards. Verify transect representativeness, access conditions and permissions for Kazakhstan and analog study sites.
- Temperature series tied to hardware and campaign duration, plus a real CDS export to validate ERA5-Land ingestion. Live Gemini needs configured credentials and evaluation against independently reviewed mission queries.
- Scientist review of the rubric scales, terrain and air-temperature proxies, source comparability, and cross-body relevance. Planetary context covers prepared points and product scales. Global on-demand planetary sampling and raw PDS ingestion remain outside the current release.

## New-site discovery comparison

The previous five-query, case-blind result recovered cold and dryness using independent climate grids. The other three objectives required basalt, crew operations and cave geometry. The previous catalog had no regional map criterion for basalt and no geographic product that measured the other two requirements. Masking their known sites' field evidence therefore left them pending. The new environmental baseline supplies a regional lithology criterion and still abstains on unsupported requirements.

The [eight externally referenced queries](evaluation/discovery_queries.json) were scored using separate modes. For environmental scoring, field observations and case texts were removed for all candidates, and only product-backed values entered the score. For text search the lexical weights exclude the target region. The frozen MiniLM model uses the archived weights listed above. Both text methods were measured with the known cases present, then again with all cases from the target region removed. A held-out region's coordinate and independent products remain eligible for geographic screening. Names and publication count are outside the scoring inputs.

| Method | Recall@3 | Recall@5 |
| --- | ---: | ---: |
| Prior case-blind screening on the expanded benchmark | 2/8 | 3/8 |
| Environmental features only | 3/8 | 5/8 |
| Frozen MiniLM on known cases | 6/8 | 7/8 |
| Lexical retrieval on known cases | 6/8 | 7/8 |
| MiniLM with the target region absent from its index | 0/8 | 0/8 |

Each query has one externally documented region, so recall means the fraction of queries with that region retrieved. Unjudged candidates may be relevant. Text retrieval with the group removed has no document for that group by construction. It shows the retrieval system's dependence on indexed case text, and the full-index result measures literature search. The regional basalt result for Holuhraun crosses the top-three boundary on a score tie. Mauna Ulu remained pending because the coarse lithology grid did not supply a usable class. Cave and crew-operation objectives remained pending. Charyn and Ibex were fourth and fifth in the environmental screen. The dataset and metric are too small for a predictive accuracy claim.

```sh
python -m backend.analog_api.evaluate --judgements backend/evaluation/discovery_queries.json
python -m backend.analog_api.evaluate --judgements backend/evaluation/discovery_queries.json \
  --embedding-model /path/to/local/all-MiniLM-L6-v2
```

The release contains fixed scoring rules and a frozen pretrained encoder. Custom model training remains future work. The common scale, weights and trait mappings are transparent engineering rules. The frozen MiniLM model provides optional literature retrieval. A trainable ranker would need independently judged relevant and unsuitable sites across geographically separate missions and sites.

## Coarse-to-fine Earth discovery

The deterministic benchmark uses the 64 eligible fine cells in the prepared Ili Basin window. The coordinate baseline supplies all 64 centroids and uses the same environmental scoring rules with cached SRTM 720 m point-window terrain and center-derived lithology and climatology. It holds regional climate constant across both methods so the terrain products and measurement footprints can be compared. The legacy endpoint also requests its own POWER period and a local WorldCover window. The benchmark omits that point-window WorldCover feature. The polygon's surface-water share is available only to the area-based methods. The benchmark reports candidate agreement and computational work. It does not estimate analog validity.

The exhaustive area-based baseline evaluates all 64 cells using the same regional data as the new search. The new search evaluates four parents and, for objectives with usable features, 32 fine cells. That is **36 vs 64 scored cells per objective**, a 43.75% reduction in score evaluations. Preprocessing still caches all fine cells inside the bounded windows. The eight categories exercise one structured objective apiece.

| Objective | Centroid baseline returned | Spatial returned | Overlap with exhaustive area top 5 | Same top cell as centroid |
| --- | ---: | ---: | ---: | --- |
| Mobility | 5 | 5 | 4/5 | No |
| Sedimentary geology | 5 | 5 | 5/5 | Yes |
| Thermal | 5 | 5 | 4/5 | Yes |
| Surface water | 0 | 5 | 3/5 | Unavailable |
| Aeolian | 5 | 5 | 5/5 | No |
| Aridity as a habitability proxy | 5 | 5 | 5/5 | Yes |
| Caves | 0 | 0 | Unavailable | Unavailable |
| Operations terrain | 5 | 5 | 3/5 | No |

The new method recovered the best exhaustive-area score for all seven supported objectives. Exact ID overlap includes effects from regional ties and from selecting distinct parent regions before siblings. For geology, 56 cells tied at or above the top-five cutoff. Differences in the top terrain result are expected when 720 m point-window gradients and regional gradients describe different spatial scales. Neither comparison has independent field labels. The method uses a fixed scoring rubric and contains no custom trained model.

```sh
python -m backend.analog_api.evaluate_search
```
