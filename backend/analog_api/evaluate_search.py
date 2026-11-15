"""Compare cached centroid-based discovery, coarse-to-fine search and a fine-grid oracle."""
import argparse
import json
from pathlib import Path

from pydantic import TypeAdapter

from .catalog import load_catalog, validate_measurements
from .models import Feature, Measurement
from .spatial import assess_cells, cell_sort_key, load_search_grid, screening_catalog, search_regions
from .spatial_models import SpatialSearchRequest

QUERIES = (
    ("mobility", {"category": "terrain", "preferences": [{"feature": "slope_p90_deg", "direction": "higher"}]}),
    ("sedimentary geology", {"category": "geology", "traits": ["sedimentary_outcrops"]}),
    ("thermal", {"category": "temperature", "preferences": [{"feature": "coldest_month_mean_air_temperature_c", "direction": "lower"}]}),
    ("surface water", {"category": "water", "preferences": [{"feature": "mapped_surface_water_pct", "direction": "higher"}]}),
    ("aeolian", {"category": "atmosphere", "traits": ["aeolian_landforms"]}),
    ("aridity proxy", {"category": "biology", "traits": ["aridity"]}),
    ("caves", {"category": "subsurface", "traits": ["lava_caves"]}),
    ("operations terrain", {"category": "operations", "preferences": [{"feature": "slope_p90_deg", "direction": "lower"}]}),
)
SHARED_AT_CENTER = {Feature.AIR_MEAN, Feature.AIR_COLDEST_MONTH, Feature.PRECIPITATION, Feature.WIND, Feature.LITHOLOGY}


def center_view(cell, center_measurements):
    product_rows = {m.feature for m in center_measurements}
    # Regional climatology and lithology services use the center and preserve their native support.
    shared = [m for m in cell.measurements if m.feature in SHARED_AT_CENTER and m.feature not in product_rows]
    return cell.model_copy(update={"measurements": [*shared, *center_measurements]})


def compare(catalog, grid, region, limit=5, point_samples=None):
    regions = {r.id: r for r in grid.regions if r.id == region}
    if not regions:
        raise ValueError(f"Unknown search region: {region}")
    fine = [cell for cell in grid.cells if cell.region_id == region and cell.parent_id and cell.land_eligible]
    known = {c.id: [] for c in fine}
    physical = screening_catalog(catalog, fine, regions, known)
    point_samples = point_samples or {}
    for cell in fine:
        validate_measurements(point_samples.get(cell.id, []), cell.point, catalog.sources)
    point_cells = [center_view(cell, point_samples.get(cell.id, [])) for cell in fine]
    centers = screening_catalog(catalog, point_cells, regions, known)

    def order(scores):
        return sorted((s for s in scores if s.status == "ranked" and s.suitability_index > 0), key=cell_sort_key)

    rows = []
    for label, supplied in QUERIES:
        request = SpatialSearchRequest(regions=[region], mission={"objectives": [supplied]}, refine_per_objective=2, limit=limit)
        objective = request.mission.objectives[0]
        exhaustive = order(assess_cells(physical, fine, objective, None))
        baseline = [r.site.id for r in order(assess_cells(centers, point_cells, objective, None))[:limit]]
        geographic = search_regions(catalog, grid, request)
        ranked = geographic.objectives[0].recommendations
        top = {s.site.id for s in exhaustive[:limit]}
        ceiling = exhaustive[0].suitability_index if exhaustive else None
        returned = max((row.assessments[1].suitability_index for row in geographic.candidates), default=None)
        threshold = exhaustive[min(limit, len(exhaustive)) - 1].suitability_index if exhaustive else None
        ties = sum(s.suitability_index >= threshold for s in exhaustive) if exhaustive else 0
        rows.append({
            "objective": label, "point_candidates": len(baseline), "spatial_candidates": len(ranked),
            "coarse_scored": geographic.coarse_evaluated, "fine_scored": geographic.fine_evaluated,
            "exhaustive_fine_scored": len(fine),
            "fine_oracle_top_k_overlap": len(top.intersection(ranked)) if top else None,
            "fine_oracle_top_k_denominator": len(top), "fine_oracle_count_at_or_above_cutoff": ties,
            "best_fine_score": ceiling, "best_spatial_score": returned,
            "same_top_cell_as_coordinate_baseline": baseline[0] == ranked[0] if baseline and ranked else None,
        })
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="ili-basin")
    parser.add_argument("--limit", default=5, type=int, choices=range(1, 16))
    parser.add_argument("--point-samples", type=Path, help="Optional cached center measurements keyed by cell ID.")
    args = parser.parse_args()
    catalog = load_catalog()
    default = Path(__file__).resolve().parents[1] / "evaluation" / f"{args.region}_point_baseline.json"
    source = args.point_samples or default
    samples = TypeAdapter(dict[str, list[Measurement]]).validate_json(source.read_bytes()) if source.is_file() else {}
    print(json.dumps(compare(catalog, load_search_grid(catalog), args.region, args.limit, samples), indent=2))


if __name__ == "__main__":
    main()
