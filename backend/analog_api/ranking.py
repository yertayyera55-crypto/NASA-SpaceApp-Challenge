from .catalog import Catalog, contains_point, same_point
from .models import (
    Category, Constraint, CriterionResult, Feature, Measurement, Objective, ObjectiveResult, PlanetContext, PortfolioSite,
    RecommendRequest, Recommendation, Site, SiteProfile, SiteResult, Trait, Preference,
)
from .discovery import LITHOLOGY_CLASSES, environmental_preferences, environmental_rows, lithology_result
from .science import CATEGORIES, FEATURES, PLANET_DATASETS

HARD_FAIL = "A measured value fails an explicit bound."
UNAVAILABLE = "No comparable measurement is available for this criterion at this sampling point."
RANKING_METHOD = (
    "Equal weight per criterion. A measured bound that fails excludes the site. An unknown bound "
    "leaves it pending. Unknown criteria earn zero points in a fixed denominator. The index is reported separately from evidence coverage. "
    "Scores are conditional on this objective and screening rubric."
)
SOURCE_PRIORITY = {"university": 0, "era5": 1, "power": 2, "cinder_dem": 3, "srtm": 4, "copernicus_dem": 5}
ENVIRONMENT_METHOD = (
    "Suitability uses physical provider data and objective-specific criteria. Missing preferences contribute zero "
    "to the fixed denominator. Unknown requirements leave a site pending. Published cases are supporting context."
)
DEFAULT_FALLBACKS = {Category.TERRAIN: Trait.CHALLENGING_TERRAIN, Category.TEMPERATURE: Trait.COLD}


def profile(catalog: Catalog, site: Site) -> SiteProfile:
    measurements = catalog.features.earth.get(site.id, [])
    cases = catalog.cases_at(site.id)
    refs = [*site.source_ids, *(o.source_id for o in site.observations),
            *(m.source_id for m in measurements), *(c.source_id for c in cases)]
    return SiteProfile(site=site, measurements=measurements, cases=cases, sources=catalog.source_list(refs))


def match_measurement(rows: list[Measurement], feature: Feature, group: str | None) -> Measurement | None:
    candidates = [m for m in rows if m.feature == feature and m.value_origin != "demonstration" and (group is None or m.statistic_group == group)]
    return min(candidates, key=lambda m: (SOURCE_PRIORITY.get(m.source_id, 10), m.source_id), default=None)


def numeric_result(criterion: Constraint | Preference, measurement: Measurement | None) -> CriterionResult:
    feature = criterion.feature
    if measurement is None:
        return CriterionResult(feature=feature, status="unavailable", detail=UNAVAILABLE)
    value = measurement.value
    assert isinstance(value, float)
    label = f"{value:g} {measurement.unit} ({measurement.method})"
    if isinstance(criterion, Preference):
        low, high = FEATURES[feature].screening_scale
        points = min(1, max(0, (value - low) / (high - low)))
        if criterion.direction == "lower":
            points = 1 - points
        return CriterionResult(feature=feature, status="scored", points=points,
                               detail=f"{label}. Linear preference for {criterion.direction} values across [{low:g}, {high:g}].",
                               measurement=measurement)
    meets_min = criterion.min is None or value > criterion.min or value == criterion.min and not criterion.min_exclusive
    meets_max = criterion.max is None or value < criterion.max or value == criterion.max and not criterion.max_exclusive
    met = meets_min and meets_max
    detail = "The measured value is within the requested bounds." if met else HARD_FAIL
    return CriterionResult(feature=feature, status="met" if met else "failed", points=float(met),
                           detail=f"{label}. {detail}", measurement=measurement)


def trait_result(site: Site, traits: tuple[Trait, ...]) -> CriterionResult:
    obs = next((obs for trait in traits for obs in site.observations if obs.trait == trait), None)
    if obs is None:
        return CriterionResult(trait=traits[0] if len(traits) == 1 else None, status="unavailable",
                               detail="No catalog evidence for " + " or ".join(traits) + ".")
    return CriterionResult(trait=obs.trait, status="observed", points=0.65, detail=obs.detail, observation=obs)


def assess_site(catalog: Catalog, site: Site, objective: Objective, body: str | None,
                preference_groups: dict[Feature, str], *, environmental: bool = False) -> SiteResult:
    spec = CATEGORIES[objective.category]
    rows = catalog.features.earth.get(site.id, [])
    preferences = objective.preferences
    if environmental:
        rows = environmental_rows(catalog, rows)
        preferences = environmental_preferences(objective)
    results = [numeric_result(c, match_measurement(rows, c.feature, c.statistic_group)) for c in objective.constraints]
    results.extend(numeric_result(p, match_measurement(rows, p.feature, preference_groups.get(p.feature)))
                   for p in preferences)
    if environmental:
        geology = [trait for trait in objective.traits if trait in LITHOLOGY_CLASSES]
        if objective.category == Category.GEOLOGY and not objective.traits and not results:
            geology = list(LITHOLOGY_CLASSES)
        if geology:
            lithology = match_measurement(rows, Feature.LITHOLOGY, "glim_v1_0.5deg")
            if objective.traits:
                results.extend(lithology_result(lithology, [trait], required=True) for trait in geology)
            else:
                results.append(lithology_result(lithology, geology, required=False))
        proxies = [Trait.ARID, Trait.COLD, Trait.CHALLENGING_TERRAIN, Trait.AEOLIAN]
        for trait in objective.traits:
            if trait not in proxies and trait not in geology:
                results.append(CriterionResult(trait=trait, status="unavailable",
                                               detail="No configured physical product can evaluate this trait."))
        if not results:
            results.append(CriterionResult(status="unavailable", detail="Supply a supported physical criterion for this objective."))
    else:
        results.extend(trait_result(site, (trait,)) for trait in objective.traits)
    if objective.clarification_required:
        results.append(CriterionResult(status="unavailable", detail="Confirm this objective's requirements before ranking."))
    if not results:
        if spec.default_direction:
            feature, direction = spec.default_direction
            group = preference_groups.get(feature)
            result = numeric_result(Preference(feature=feature, direction=direction), match_measurement(rows, feature, group))
            fallback = DEFAULT_FALLBACKS.get(objective.category)
            if result.status == "unavailable" and fallback:
                observation = trait_result(site, (fallback,))
                if observation.status == "observed":
                    results = [observation]
            results = results or [result]
        else:
            results = [trait_result(site, spec.default_traits)]

    observations = [r for r in results if r.points is not None]
    missing = [r.feature.value if r.feature else r.trait.value if r.trait else r.detail
               for r in results if r.status == "unavailable"]
    unmet = any(r.status == "failed" for r in results)
    bound_features = {c.feature for c in objective.constraints}
    missing_bound = any(r.status == "unavailable" and r.feature in bound_features for r in results)
    partial = len(observations) < len(results)
    status = ("constraint_failed" if unmet else "needs_data"
              if objective.clarification_required or missing_bound or not observations else "ranked")
    if environmental and status == "ranked":
        if any(r.status == "unavailable" and (r.trait or r.feature == Feature.LITHOLOGY) for r in results):
            status = "needs_data"
    score = sum(r.points for r in observations) / len(results) * 100 if status == "ranked" else None
    cases = [c for c in catalog.cases_at(site.id) if objective.category in c.categories
             and (body is None or not c.target_bodies or body in c.target_bodies)]
    source_ids = [*site.source_ids, *(case.source_id for case in cases)]
    limitations = [spec.limitations, *site.limitations]
    if partial:
        limitations.append("Some requested evidence is missing. Review coverage before comparing scores.")
    if body == "moon" and objective.category == Category.ATMOSPHERE:
        limitations.append("Wind-driven Earth processes have limited direct applicability to the airless lunar surface.")
    for row in results:
        if row.measurement:
            source_ids.append(row.measurement.source_id)
            limitations.extend(row.measurement.limitations)
        if row.observation:
            source_ids.append(row.observation.source_id)
    limitations.extend(limit for case in cases for limit in case.limitations)

    return SiteResult(site=site, suitability_index=round(score, 2) if score is not None else None,
                      data_coverage=round(len(observations) / len(results), 3), status=status,
                      criteria=results, missing=missing, limitations=list(dict.fromkeys(limitations)),
                      cases=cases, sources=catalog.source_list(source_ids))


def comparable_preferences(catalog: Catalog, sites: list[Site], objective: Objective, *, environmental: bool = False) -> dict[Feature, str]:
    """Prefer the statistical group with the broadest coverage for a directional comparison."""
    spec = CATEGORIES[objective.category]
    preferences = environmental_preferences(objective) if environmental else objective.preferences
    if not environmental and spec.default_direction and not (objective.constraints or preferences or objective.traits):
        feature, direction = spec.default_direction
        preferences = [Preference(feature=feature, direction=direction)]
    groups = {}
    for preference in preferences:
        if preference.statistic_group:
            groups[preference.feature] = preference.statistic_group
            continue
        coverage: dict[str, set[str]] = {}
        for site in sites:
            rows = catalog.features.earth.get(site.id, [])
            if environmental:
                rows = environmental_rows(catalog, rows)
            for measurement in rows:
                if measurement.feature == preference.feature and measurement.value_origin != "demonstration":
                    coverage.setdefault(measurement.statistic_group, set()).add(site.id)
        if coverage:
            groups[preference.feature] = min(coverage, key=lambda key: (-len(coverage[key]), key))
    return groups


def rank(catalog: Catalog, request: RecommendRequest) -> Recommendation:
    mission = request.mission
    countries = {name.casefold() for name in mission.countries}
    sites = [s for s in catalog.sites.values() if (not countries or s.country.casefold() in countries)
             and (mission.include_screening or s.status == "documented_analog")]
    environmental = request.ranking_mode == "environmental"
    results = []
    portfolio: dict[str, list[int]] = {}
    uncovered = []
    body = mission.target.body if mission.target else None
    for index, objective in enumerate(mission.objectives, start=1):
        groups = comparable_preferences(catalog, sites, objective, environmental=environmental)
        assessed = [assess_site(catalog, site, objective, body, groups, environmental=environmental) for site in sites]
        ranked = sorted((r for r in assessed if r.status == "ranked"),
                        key=(lambda r: (-r.suitability_index, -r.data_coverage, r.site.point.lat, r.site.point.lon))
                        if environmental else (lambda r: (-r.data_coverage, -r.suitability_index, r.site.id)))
        if ranked:
            portfolio.setdefault(ranked[0].site.id, []).append(index)
        else:
            uncovered.append(index)
        results.append(ObjectiveResult(
            objective_id=index, objective=objective, evaluated_sites=len(sites), recommendations=ranked[:request.limit],
            needs_data=sorted((r for r in assessed if r.status == "needs_data"), key=lambda r: (-r.data_coverage, r.site.id)),
            excluded=sorted((r for r in assessed if r.status == "constraint_failed"), key=lambda r: r.site.id),
        ))
    context = None
    if mission.target:
        target = mission.target
        rows = next((item.measurements for item in catalog.features.planetary if item.body == body and target.point
                     and same_point(item.point, target.point)), [])
        present = {m.feature for m in rows}
        missing = set(FEATURES) - present if target.point else set()
        cells = [cell for cell in catalog.features.planetary_cells
                 if target.point is not None and cell.body == body and contains_point(cell, target.point)]
        dataset = PLANET_DATASETS[body]
        context = PlanetContext(
            target=target, measurements=rows, missing=sorted(missing), containing_cells=cells,
            sources=catalog.source_list([dataset.source_id, dataset.geologic_source, *(m.source_id for m in rows), *(cell.source_id for cell in cells)]),
            limitations=["Planetary point measurements are context for mission design. Earth rankings use the supplied objective criteria.",
                         "Point measurements match exact prepared coordinates. Containing cells describe regional sample aggregates." if target.point
                         else "Select a planetary coordinate to request point context."],
        )
    return Recommendation(mission=mission, results=results,
                          portfolio=[PortfolioSite(site_id=site_id, objective_ids=ids) for site_id, ids in portfolio.items()],
                          uncovered_objective_ids=uncovered, planetary_context=context, methodology=ENVIRONMENT_METHOD if environmental else RANKING_METHOD)
