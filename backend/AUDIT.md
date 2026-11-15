# Science data audit

## Earth feature snapshot

All 87 rows in the original Earth snapshot were verified. The online replay reproduced 85 values exactly at the stored coordinates, units and periods. Two values were confirmed directly in the University Valley study. Each row in [earth_audit.csv](data/earth_audit.csv) records the original number, verified number, source link, verification method and value origin. The repository now exposes `value_origin` on each measurement.

| Source | Rows | Origin | Verification scope |
| --- | ---: | --- | --- |
| NASA POWER | 48 | 36 estimated, 12 derived | Replayed the climatology API. Annual near-surface temperature, precipitation and wind are reanalysis estimates. Coldest-month temperature is the minimum of 12 estimated monthly means. [NASA POWER meteorology](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/) |
| NASA SRTM | 14 | 14 derived | Replayed the 81-sample elevation windows via OpenTopoData, which documents the SRTMGL1 HGT source. Seven center samples and seven computed slope results matched. The underlying provider tiles and their void-fill masks were not checked independently. [NASA/USGS product guide](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf), [delivery adapter](https://www.opentopodata.org/datasets/srtm/) |
| Copernicus GLO-30 | 13 | 13 derived | Read original public tiles again. Seven center elevations and six calculated slopes matched. [Copernicus DEM](https://registry.opendata.aws/copernicus-dem/) |
| ESA WorldCover 2021 | 10 | 10 derived | Re-read the class windows from v200 COGs. Each result is the class-60 fraction in the sampled window. [ESA WorldCover](https://esa-worldcover.org/en/data-access) |
| University Valley | 2 | 2 observed | The paper reports the three-year mean air temperature of −23.4 °C and an ice-cemented interface 42 cm deep at the weather station. The air temperature is a field observation summary. [Field publication, Table II, discussion and Fig. 6](https://doi.org/10.1017/S0954102022000025) |

The audit found zero unsupported or demonstration values in the bundled Earth snapshot. Synthetic rasters and climate records are limited to tests. The ranking excludes rows explicitly marked `demonstration`. Legacy overlays without origin metadata are labeled `unknown` for backward compatibility.

Coverage gaps were preserved. SRTM produced no rows at the five high-latitude points. The two Antarctic WorldCover values and regional Dry Valleys slope remain absent. No authenticated ERA5-Land measurements were available. The three newly documented sites have published qualitative evidence and no verified numerical rows. Coordinate precision is inherited from the source or sampling convention. A raster cell or reanalysis grid average does not establish the conditions at a particular test route.

To replay the provider-backed portion from the repository root after installing the geo dependencies:

```sh
python -m backend.analog_api.prepare --output backend/local/audit-replay.json earth \
  --products power srtm worldcover \
  --sites holuhraun krafla yungay atacama university-valley dry-valleys haughton cinder-lake ustyurt betpak oyyl aktau
python -m backend.analog_api.prepare --output backend/local/audit-replay.json earth \
  --products copernicus-dem --sites holuhraun krafla yungay university-valley dry-valleys haughton cinder-lake
```

Use a fresh path when comparing provider coverage so older overlay rows cannot mask a missing fetch. Compare by `site_id`, `source_id`, and `feature`. A replay checks provenance and reproducibility. Independent instrument or field validation is a separate task.

## Research case review

| Existing case | Verified location rationale and source |
| --- | --- |
| RAVEN | Flood basalts of different ages and overlying sediment allow rover and aerial sampling comparisons. The DOI matches the author's institutional record. [Article DOI](https://doi.org/10.3847/psj/ad55f4), [University of Arizona record](https://experts.arizona.edu/en/publications/comparing-rover-and-helicopter-planetary-mission-architectures-in/) |
| Holuhraun grainflows | Aeolian sand accumulates beside the lava flow and provides dry flows for a Mars process comparison. [USGS author manuscript](https://pmc.ncbi.nlm.nih.gov/articles/PMC8243843/) |
| Krafla UAV | Basaltic fissure lava contains small vent openings suitable for image-based characterization. Updated the record to the accessible publisher page for the same paper. [Remote Sensing article](https://www.mdpi.com/2072-4292/12/12/1970) |
| Yungay soil | The hyperarid environment provides a field comparison for low detected organics and the interpretation of Viking measurements. [Science article record](https://pubmed.ncbi.nlm.nih.gov/14605363/) |
| University Valley | Dry permafrost above ice-cemented ground allows study of ice stability in a cold desert. [Antarctic Science article](https://doi.org/10.1017/S0954102022000025) |
| Haughton | The rocky, remote Arctic crater supports logistics and human–robot operations research. Corrected the record from a general program summary to the specific 2005 expedition and corrected the source title. [NASA technical publication](https://ntrs.nasa.gov/citations/20060013129) |
| Cinder Lake | Its cinder surface supported construction of an Apollo crater pattern for a crew location exercise. Updated the source to the accessible report PDF. [USGS report](https://pubs.usgs.gov/of/1967/0007/report.pdf) |

Added four primary-source cases. The catalogue records the test objective, location rationale, experiment and limits for each.

- NASA Desert RATS 2008 used Black Point Lava Flow for long rover traverses, night driving and overnight operations. [NASA technical report](https://ntrs.nasa.gov/citations/20090012335)
- NASA JETT3 used the rocky terrain and limited communications near S P Crater for an integrated Artemis field simulation. [NASA field report](https://ntrs.nasa.gov/citations/20230000146), [NASA photo record](https://www.nasa.gov/image-article/practicing-our-moonwalk/)
- The USGS selected S P Mountain's cone, lava flow and graben to teach recognition of planetary volcanic landforms. [USGS field guide](https://pubs.usgs.gov/publication/ofr20211072)
- NASA surveyed Indian Tunnel because its collapse pits and accessible lava-tube interior support comparison of surface and subsurface lidar mapping. [NASA report](https://ntrs.nasa.gov/citations/20170002387)

The service retains Cinder Lake, Black Point and S P Mountain as distinct sites. They share one northern Arizona group for retrieval and evaluation. Site suitability uses at most one observation per requested trait and has no publication-count input.

## Discovery expansion

The original 87 audit rows remain unchanged. The expanded snapshot now has 154 Earth records across 19 sites. It adds 49 verified provider values from NASA POWER, SRTM via OpenTopoData and WorldCover for seven previously unmeasured coordinates, and 18 GLiM regional classes from the publisher grid. The Mauna Ulu coordinate has no usable dominant land class in this coarse grid. [GLiM source](https://doi.pangaea.de/10.1594/PANGAEA.788537)

The additional entries capture environmental context and why each site was selected:

- Mauna Ulu was used by NASA BASALT to compare young shield lavas and alteration. [Peer-reviewed study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442300/)
- The Ibex Dune Field study used an active dune field to compare bedforms, winds, migration and sediment dynamics. [Published study in NASA NTRS](https://ntrs.nasa.gov/citations/20260000452)
- USGS used Meteor Crater's preserved impact setting and sample collection to characterize impact melts in sedimentary material. [USGS report](https://pubs.usgs.gov/publication/ofr20241062/full)
- Charyn Canyon's sediment sequence records changes between alluvial and windblown deposition. It is terrestrial context for a screening candidate. [Peer-reviewed study](https://doi.org/10.1038/s43247-021-00173-z)

Case records include a curated purpose ID. At load time, a repeated purpose within the same region retains the first canonical case, including when reports use different titles or come from different sources. Distinct purposes at the same region remain available. Case retrieval still returns one hit per region.
