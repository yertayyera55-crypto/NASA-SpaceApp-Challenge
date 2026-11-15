from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from backend.analog_api.catalog import load_catalog
from backend.analog_api.evaluate_search import compare
from backend.analog_api.main import create_app
from backend.analog_api.models import Feature, Measurement
from backend.analog_api.spatial import load_search_grid, search_regions
from backend.analog_api.spatial_models import SpatialSearchRequest


@pytest.fixture(scope="module")
def science():
    catalog = load_catalog()
    return catalog, load_search_grid(catalog)


def test_prepared_region_counts_and_sources(science):
    _, grid = science
    assert len(grid.regions) == 20 and len(grid.cells) == 578
    assert sum(c.parent_id is None for c in grid.cells) == 34
    assert Counter(m.source_id for c in grid.cells for m in c.measurements) == {
        "power": 2312, "copernicus_glo90": 1156, "worldcover": 1088, "glim": 570}
    assert all(m.period == "2001–2025" for c in grid.cells for m in c.measurements if m.source_id == "power")
    assert all(sum(c.parent_id == p.id for c in grid.cells) == 16 for p in grid.cells if p.parent_id is None)
    assert all(c.measurements and c.land_eligible for c in grid.cells if c.region_id == "ili-basin")


def test_coarse_to_fine_mission_can_abstain_and_build_portfolio(science):
    catalog, grid = science
    request = SpatialSearchRequest(regions=["ustyurt", "betpak-dala", "ili-basin"], mission={"countries": ["Kazakhstan"], "objectives": [
        {"category": "terrain"},
        {"category": "temperature"},
        {"category": "geology", "traits": ["sedimentary_outcrops"]},
        {"category": "subsurface", "traits": ["lava_caves"]},
    ]}, limit=3, include_documented_cells=False)
    result = search_regions(catalog, grid, request)
    assert result.coarse_evaluated == 12
    assert result.fine_evaluated == 112
    assert len(result.portfolio) == 3 and result.uncovered_objective_ids == [4]
    assert result.objectives[3].missing_requirements == ["lava_caves"]
    assert not result.objectives[3].refined_parent_ids
    assert all(c.evidence_status == "new_screening_candidate" for c in result.candidates)
    candidates = {row.cell.id: row for row in result.candidates}
    for objective in result.objectives:
        assert len(objective.refined_parent_ids) <= 3
        for cell_id in objective.recommendations:
            item = candidates[cell_id]
            assert item.cell.parent_id in objective.refined_parent_ids
            assert list(item.assessments) == [1, 2, 3, 4]
            assert item.assessments[objective.objective_id].sources
            assert item.geometry.coordinates[0][0] == (item.cell.bounds.west, item.cell.bounds.south)
            assert item.geometry.coordinates[0][0] == item.geometry.coordinates[0][-1]


def test_missing_required_water_never_matches(science):
    catalog, grid = science
    result = search_regions(catalog, grid, SpatialSearchRequest(regions=["dry-valleys"], mission={
        "objectives": [{"category": "water", "constraints": [{"feature": "mapped_surface_water_pct", "min": 0}]}]}))
    assert result.coarse_evaluated == 2 and result.fine_evaluated == 32
    assert result.objectives[0].needs_data == 32
    assert result.objectives[0].excluded == 0
    assert result.uncovered_objective_ids == [1] and not result.candidates


def test_documented_site_is_separate_from_discovery_hypothesis(science):
    catalog, grid = science
    request = SpatialSearchRequest(regions=["atacama"], mission={"include_screening": False, "objectives": [
        {"category": "terrain", "constraints": [{"feature": "slope_p90_deg", "min": 0}]}]})
    result = search_regions(catalog, grid, request)
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.evidence_status == "contains_documented_analog"
    assert candidate.documented_site_ids == ["yungay"]
    assert candidate.assessments[1].cases == []


def test_region_route_is_offline_and_keeps_existing_contract(science, monkeypatch):
    catalog, _ = science

    def forbidden(*args, **kwargs):
        raise AssertionError("Regional search must not request network data.")

    monkeypatch.setattr("httpx.Client.get", forbidden)
    with TestClient(create_app(catalog)) as client:
        regions = client.get("/api/discovery-regions").json()
        assert len(regions) == 20
        body = {"regions": ["ili-basin"], "mission": {"objectives": [{"category": "terrain"}]}}
        result = client.post("/api/discover/regions", json=body)
        assert result.status_code == 200
        assert result.json()["fine_evaluated"] == 48
        assert client.post("/api/discover/regions", json=body | {"regions": ["unknown"]}).status_code == 422
        assert client.post("/api/recommend", json={"mission": body["mission"]}).status_code == 200
        assert "/api/discover" in client.get("/openapi.json").json()["paths"]

        global_search = client.post("/api/discover/regions", json={
            "regions": [region["id"] for region in regions], "refine_per_objective": 12,
            "mission": {"objectives": [{"category": "temperature", "preferences": [
                {"feature": "air_temperature_mean_c", "direction": "higher"}]}]},
        })
        assert global_search.status_code == 200
        expanded = global_search.json()
        assert expanded["coarse_evaluated"] == 34
        assert len(expanded["objectives"][0]["refined_parent_ids"]) == 12
        assert expanded["candidates"][0]["cell"]["region_id"] == "danakil"

        kazakhstan = client.post("/api/discover/regions", json={
            "mission": {"countries": ["Kazakhstan"], "objectives": [{"category": "terrain"}]},
        }).json()
        assert {region["id"] for region in kazakhstan["regions"]} == {
            "ustyurt", "betpak-dala", "ili-basin", "aral-east", "balkhash-south"}
        assert kazakhstan["coarse_evaluated"] == 14


def test_ili_basin_benchmark_scores_fewer_cells_and_abstains_on_caves(science):
    catalog, grid = science
    path = Path(__file__).resolve().parents[1] / "evaluation" / "ili-basin_point_baseline.json"
    points = TypeAdapter(dict[str, list[Measurement]]).validate_json(path.read_bytes())
    assert len(points) == 64
    assert all({m.feature for m in rows} == {Feature.ELEVATION, Feature.SLOPE} for rows in points.values())
    results = compare(catalog, grid, "ili-basin", point_samples=points)
    assert len(results) == 8
    for row in results:
        assert row["exhaustive_fine_scored"] == 64
        if row["objective"] == "caves":
            assert row["fine_scored"] == row["spatial_candidates"] == row["point_candidates"] == 0
        else:
            assert row["coarse_scored"] + row["fine_scored"] == 36
            assert row["best_spatial_score"] == row["best_fine_score"]
