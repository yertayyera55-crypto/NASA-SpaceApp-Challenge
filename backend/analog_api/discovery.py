"""Mission-specific environmental screening of catalogue and unfamiliar coordinates."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

from .catalog import Catalog, validate_measurements
from .lithology import mapped_lithology
from .models import (
    Category as C, CriterionResult, DiscoveryRequest, DiscoveryResponse, Feature as F,
    Measurement, Preference, RecommendRequest, Site, Trait as T,
)

LITHOLOGY_CLASSES = {
    T.BASALT: {"vb"},
    T.SEDIMENTARY: {"ss", "sm", "sc", "su"},
    T.EVAPORITES: {"ev"},
}

DEFAULT_ENVIRONMENT = {
    C.TERRAIN: ((F.SLOPE, "higher"),),
    C.TEMPERATURE: ((F.AIR_COLDEST_MONTH, "lower"),),
    C.ATMOSPHERE: ((F.WIND, "higher"), (F.BARE_COVER, "higher")),
}

# Product provenance is the eligibility rule. Field-study observations and names
# can be displayed with results but never participate in this score.
def environmental_rows(catalog: Catalog, rows: list[Measurement]) -> list[Measurement]:
    return [row for row in rows if row.value_origin in ("derived", "estimated", "observed")
            and catalog.sources[row.source_id].kind == "product"]


def environmental_preferences(objective):
    preferences = list(objective.preferences)
    requested = {criterion.feature for criterion in [*objective.constraints, *preferences]}
    defaults = ()
    if not requested and not objective.traits:
        defaults = DEFAULT_ENVIRONMENT.get(objective.category, ())
    if T.ARID in objective.traits:
        defaults = (*defaults, (F.PRECIPITATION, "lower"))
    if T.COLD in objective.traits:
        defaults = (*defaults, (F.AIR_COLDEST_MONTH, "lower"))
    if T.CHALLENGING_TERRAIN in objective.traits:
        defaults = (*defaults, (F.SLOPE, "higher"))
    if T.AEOLIAN in objective.traits:
        defaults = (*defaults, (F.WIND, "higher"), (F.BARE_COVER, "higher"))
    preferences.extend(Preference(feature=feature, direction=direction)
                       for feature, direction in defaults if feature not in requested)
    return preferences


def lithology_result(measurement: Measurement | None, traits: list[T], *, required: bool) -> CriterionResult:
    trait = traits[0] if len(traits) == 1 else None
    if measurement is None:
        return CriterionResult(feature=F.LITHOLOGY, trait=trait, status="unavailable",
                               detail="No eligible GLiM lithology grid value covers this coordinate.")
    allowed = set().union(*(LITHOLOGY_CLASSES[item] for item in traits))
    fits = float(measurement.value in allowed)
    return CriterionResult(
        feature=F.LITHOLOGY, trait=trait, status="failed" if required and not fits else "scored", points=0.65 * fits, measurement=measurement,
        detail=f"GLiM class {measurement.value}. Regional screening classes: {', '.join(sorted(allowed))}. "
               "A coarse match contributes 0.65 screening points. Local rock and outcrop remain unverified.",
    )


def collect_products(point, client):
    results = []
    unavailable = []
    lithology = mapped_lithology(point)
    if lithology:
        results.append(lithology)
    else:
        unavailable.append("glim")
    loaders = {}
    try:
        from .geospatial import copernicus_window, read_worldcover, srtm_window
        from rasterio.errors import RasterioError
    except ImportError:
        unavailable.extend(["srtm", "copernicus_dem", "worldcover"])
        extraction_errors = ()
    else:
        loaders.update({"srtm": lambda: srtm_window(client, point), "copernicus_dem": lambda: copernicus_window(point),
                        "worldcover": lambda: read_worldcover(point)})
        extraction_errors = (RasterioError,)
    from .earth import read_power
    import httpx

    loaders["power"] = lambda: read_power(client, point)
    def fetch(loader):
        try:
            return loader()
        except (httpx.HTTPError, OSError, ValueError, TypeError, KeyError, *extraction_errors):
            return []

    with ThreadPoolExecutor(max_workers=4) as pool:
        for source, rows in zip(loaders, pool.map(fetch, loaders.values()), strict=True):
            if rows:
                results.extend(rows)
            else:
                unavailable.append(source)
    return results, unavailable


def assess_coordinate(catalog: Catalog, request: DiscoveryRequest, rows, unavailable) -> DiscoveryResponse:
    from .ranking import assess_site, comparable_preferences, profile, rank

    validate_measurements(rows, request.point, catalog.sources)
    site_id = "requested-coordinate"
    site = Site(id=site_id, name="Requested coordinate", country="Unverified",
                point=request.point, coordinate_note="User-supplied Earth WGS84 coordinate.",
                status="screening_candidate", site_group=site_id, source_ids=sorted({row.source_id for row in rows}),
                limitations=["The coordinate's country, access, local ground conditions and permissions require separate verification."])
    features = catalog.features.model_copy(update={"earth": catalog.features.earth | {site_id: rows}})
    ephemeral = replace(catalog, features=features, sites=catalog.sites | {site_id: site})
    comparison = rank(catalog, RecommendRequest(mission=request.mission, ranking_mode="environmental", limit=request.limit))
    countries = {name.casefold() for name in request.mission.countries}
    scope = [catalog.sites[site_id] for site_id in catalog.sites
             if (not countries or catalog.sites[site_id].country.casefold() in countries)
             and (request.mission.include_screening or catalog.sites[site_id].status == "documented_analog")]
    body = request.mission.target.body if request.mission.target else None
    assessed = []
    for objective in request.mission.objectives:
        groups = comparable_preferences(catalog, scope, objective, environmental=True)
        assessed.append(assess_site(ephemeral, site, objective, body, groups, environmental=True))
    return DiscoveryResponse(candidate=profile(ephemeral, site), unavailable_products=unavailable,
                             objectives=assessed, comparison=comparison)
