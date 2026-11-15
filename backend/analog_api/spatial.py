"""Offline coarse-to-fine search over prepared Earth observation cells."""
from collections import defaultdict
from dataclasses import replace
from pathlib import Path

from .catalog import DATA, Catalog, validate_measurements
from .models import Feature, PortfolioSite, Site, SiteResult
from .overlays import bounds_polygon
from .ranking import assess_site, comparable_preferences
from .spatial_models import SearchCell, SearchGrid, SpatialCandidate, SpatialObjective, SpatialSearchRequest, SpatialSearchResponse

SEARCH_GRID = DATA / "earth_search_grid.json"
CELL_SCALE_FEATURES = {Feature.SLOPE, Feature.ELEVATION, Feature.BARE_COVER, Feature.SURFACE_WATER, Feature.LITHOLOGY}
METHODOLOGY = (
    "The search scores coarse cells, refines the strongest promising parents for each objective, and ranks their fine cells. "
    "Fine scores use geographic products only. Missing preferences contribute zero and missing requirements leave a cell pending. "
    "Polygons are screening areas. Their centers are reference coordinates and require local surveys."
)


def inside(point, bounds):
    return bounds.south <= point.lat < bounds.north and bounds.west <= point.lon < bounds.east


def contains(outer, inner):
    return outer.south <= inner.south < inner.north <= outer.north and outer.west <= inner.west < inner.east <= outer.east


def cell_sort_key(result):
    return (-result.suitability_index, -result.data_coverage, result.site.point.lat, result.site.point.lon, result.site.id)


def load_search_grid(catalog: Catalog, path: Path = SEARCH_GRID) -> SearchGrid:
    grid = SearchGrid.model_validate_json(path.read_bytes())
    regions = {region.id: region for region in grid.regions}
    if len(regions) != len(grid.regions):
        raise ValueError("Duplicate spatial search region.")
    index = {cell.id: cell for cell in grid.cells}
    if len(index) != len(grid.cells):
        raise ValueError("Duplicate spatial search cell.")
    for cell in grid.cells:
        if cell.region_id not in regions or cell.id in catalog.sites or not contains(regions[cell.region_id].bounds, cell.bounds):
            raise ValueError(f"Cell is outside its region: {cell.id}")
        b = cell.bounds
        if abs(cell.point.lat - (b.south + b.north) / 2) > 1e-9 or abs(cell.point.lon - (b.west + b.east) / 2) > 1e-9:
            raise ValueError(f"Cell center differs from its polygon midpoint: {cell.id}")
        if cell.parent_id:
            parent = index.get(cell.parent_id)
            if (parent is None or parent.parent_id or parent.region_id != cell.region_id
                    or parent.bounds == cell.bounds or not contains(parent.bounds, cell.bounds)):
                raise ValueError(f"Invalid fine-cell parent: {cell.id}")
        validate_measurements(cell.measurements, cell.point, catalog.sources)
    return grid


def screening_catalog(catalog, cells, regions, documented):
    sites = {}
    for cell in cells:
        region = regions[cell.region_id]
        known = documented[cell.id]
        sites[cell.id] = Site(
            id=cell.id, name=f"{region.name} · {cell.id.rsplit('/', 1)[-1]}", country=region.country,
            point=cell.point, coordinate_note="Centroid of geographic search cell. Country is the prepared region's label.",
            status="screening_candidate", site_group=cell.parent_id or cell.id,
            source_ids=sorted({m.source_id for m in cell.measurements}),
            limitations=["No field validation. Use the geographic polygon and measurement scale for follow-up."]
            + (["The cell contains a documented catalog analog. Its suitability still uses physical products only."] if known else []),
        )
    features = catalog.features.model_copy(update={"earth": {cell.id: cell.measurements for cell in cells}})
    return replace(catalog, sites=sites, cases=(), features=features)


def assess_cells(catalog, cells, objective, body, groups=None):
    sites = [catalog.sites[cell.id] for cell in cells]
    if groups is None:
        groups = comparable_preferences(catalog, sites, objective, environmental=True)
    return [assess_site(catalog, site, objective, body, groups, environmental=True) for site in sites]


def coarse_merit(result: SiteResult):
    """Allow local terrain or map classes to improve after refinement."""
    if result.status == "ranked":
        return result.suitability_index, 1
    failed = [c for c in result.criteria if c.status == "failed"]
    if failed:
        # Child centers can land in a different terrain, map or climate grid pixel.
        return sum(c.points or 0 for c in result.criteria) / len(result.criteria) * 100, 0
    if result.status == "needs_data" and result.missing and set(result.missing) <= {f.value for f in CELL_SCALE_FEATURES}:
        return 0, 0
    return None


def diversify(ranked, by_id):
    first_by_parent = {}
    overflow = []
    for result in ranked:
        parent = by_id[result.site.id].parent_id
        if parent in first_by_parent:
            overflow.append(result)
        else:
            first_by_parent[parent] = result
    return [*first_by_parent.values(), *overflow]


def search_regions(catalog: Catalog, grid: SearchGrid, request: SpatialSearchRequest) -> SpatialSearchResponse:
    region_ids = set(request.regions)
    all_ids = {r.id for r in grid.regions}
    if region_ids - all_ids:
        raise ValueError("Unknown discovery region: " + ", ".join(sorted(region_ids - all_ids)))
    countries = {name.casefold() for name in request.mission.countries}
    regions = {r.id: r for r in grid.regions if (not region_ids or r.id in region_ids)
               and (not countries or r.country.casefold() in countries)}
    chosen = [cell for cell in grid.cells if cell.region_id in regions]
    by_id = {cell.id: cell for cell in chosen}
    established = [s for s in catalog.sites.values() if s.status == "documented_analog"]
    documented = {cell.id: [s.id for s in established if inside(s.point, cell.bounds)] for cell in chosen}
    coarse = [cell for cell in chosen if cell.parent_id is None]
    fine_by_parent = defaultdict(list)
    for cell in chosen:
        if cell.parent_id:
            fine_by_parent[cell.parent_id].append(cell)

    spatial_catalog = screening_catalog(catalog, chosen, regions, documented)
    fine_groups = {}
    score_sets = {}
    objective_rows = []
    selected_per_objective = {}
    evaluated_fine = set()
    body = request.mission.target.body if request.mission.target else None
    eligible_ids = {c.id for c in chosen if c.parent_id and c.land_eligible
                    and (request.include_documented_cells or not documented[c.id])
                    and (request.mission.include_screening or documented[c.id])}
    reference_sites = [spatial_catalog.sites[c.id] for c in chosen if c.id in eligible_ids]
    for index, objective in enumerate(request.mission.objectives, start=1):
        coarse_scores = assess_cells(spatial_catalog, coarse, objective, body)
        promising = []
        if not objective.clarification_required:
            for result in coarse_scores:
                parent = by_id[result.site.id]
                if not any(c.id in eligible_ids for c in fine_by_parent[parent.id]):
                    continue
                if merit := coarse_merit(result):
                    promising.append((merit, result))
        promising.sort(key=lambda item: (-item[0][1], -item[0][0], -item[1].data_coverage, item[1].site.id))
        parents = [result.site.id for _, result in promising[:request.refine_per_objective]]
        fine = [cell for parent in parents for cell in fine_by_parent[parent]]
        eligible = [c for c in fine if c.id in eligible_ids]
        evaluated_fine.update(c.id for c in eligible)
        fine_groups[index] = comparable_preferences(spatial_catalog, reference_sites, objective, environmental=True)
        fine_scores = assess_cells(spatial_catalog, eligible, objective, body, fine_groups[index])
        ranked = sorted((s for s in fine_scores if s.status == "ranked" and s.suitability_index > 0), key=cell_sort_key)
        selected = diversify(ranked, by_id)[:request.limit]
        selected_per_objective[index] = selected
        score_sets[index] = {row.site.id: row for row in fine_scores}
        statuses = fine_scores if fine else coarse_scores
        pending = [row for row in statuses if row.status == "needs_data"]
        objective_rows.append(SpatialObjective(
            objective_id=index, category=objective.category, coarse_evaluated=len(coarse_scores),
            fine_evaluated=len(fine_scores), refined_parent_ids=parents,
            recommendations=[row.site.id for row in selected], needs_data=len(pending), fine_considered=len(fine),
            missing_requirements=sorted({m for row in pending for m in row.missing}),
            excluded=len(fine) - len(eligible) + len(fine_scores) - len(pending) - len(ranked) if fine else 0,
        ))

    displayed = dict.fromkeys(row.site.id for rows in selected_per_objective.values() for row in rows)
    candidates = []
    for cell_id in displayed:
        cell = by_id[cell_id]
        known = documented[cell_id]
        assessments = {}
        for index, objective in enumerate(request.mission.objectives, start=1):
            if cell_id in score_sets[index]:
                assessments[index] = score_sets[index][cell_id]
            else:
                assessments[index] = assess_cells(spatial_catalog, [cell], objective, body, fine_groups[index])[0]
        candidates.append(SpatialCandidate(cell=cell, geometry=bounds_polygon(cell.bounds), documented_site_ids=known,
                                           evidence_status="contains_documented_analog" if known else "new_screening_candidate",
                                           assessments=assessments))

    portfolio = {}
    uncovered = []
    for index, selected in selected_per_objective.items():
        if not selected:
            uncovered.append(index)
            continue
        best = selected[0]
        tied = [r for r in selected if (r.suitability_index, r.data_coverage) == (best.suitability_index, best.data_coverage)]
        choice = next((r for r in tied if r.site.site_group not in {by_id[c].parent_id for c in portfolio}), best)
        portfolio.setdefault(choice.site.id, []).append(index)
    return SpatialSearchResponse(
        mission=request.mission, regions=list(regions.values()), coarse_evaluated=len(coarse), fine_evaluated=len(evaluated_fine),
        objectives=objective_rows, candidates=candidates,
        portfolio=[PortfolioSite(site_id=cell_id, objective_ids=ids) for cell_id, ids in portfolio.items()],
        uncovered_objective_ids=uncovered, methodology=METHODOLOGY,
    )
