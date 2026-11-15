from collections import Counter
from dataclasses import replace
import csv
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pydantic import TypeAdapter
from rasterio.transform import from_origin

from backend.analog_api.catalog import DATA, load_catalog
from backend.analog_api.evaluate import DEFAULT_QUERIES, Judgement, evaluate
from backend.analog_api.models import CellBounds, Feature, RecommendRequest
from backend.analog_api.planetary_grid import MOLA, build_cells, grid_bounds
from backend.analog_api.ranking import rank


def test_audit_covers_all_earth_snapshot_values():
    catalog = load_catalog()
    with (DATA / "earth_audit.csv").open(newline="") as stream:
        audit = {(r["site_id"], r["source_id"], r["feature"]): r for r in csv.DictReader(stream)}
    assert len(audit) == 87
    bundled = {(site_id, m.source_id, m.feature): m for site_id, rows in catalog.features.earth.items() for m in rows}
    assert audit.keys() <= bundled.keys()
    assert Counter(r["value_origin"] for r in audit.values()) == {"derived": 49, "estimated": 36, "observed": 2}
    for key, row in audit.items():
        measurement = bundled[key]
        assert float(row["verified_value"]) == measurement.value
        assert row["source_url"] == catalog.sources[measurement.source_id].url
        assert row["value_origin"] == measurement.value_origin


def raster(path, data, crs="+proj=longlat +R=3396190 +type=crs"):
    with rasterio.open(path, "w", driver="GTiff", width=10, height=10, count=1, dtype="float32",
                       nodata=-9999, crs=crs, transform=from_origin(0, 0.01, 0.001, 0.001)) as ds:
        ds.write(data.astype(np.float32), 1)
    return MOLA.model_copy(update={"asset": str(path)})


def bounds(south=0.0, west=0.0, north=0.01, east=0.01):
    return CellBounds(south=south, west=west, north=north, east=east)


def test_known_plane_slope_relief_and_roughness(tmp_path):
    heights = np.tile(np.arange(10) * 10, (10, 1))
    product = raster(tmp_path / "plane.tif", heights)
    (cell,) = list(build_cells(product, bounds(), 0.01, 10))
    values = {m.feature: m.value for m in cell.measurements}
    assert cell.valid_elevations == 100 and cell.valid_gradients == 64
    assert values[Feature.ELEVATION] == 45
    assert values[Feature.RELIEF] == 90
    assert values[Feature.SLOPE] == pytest.approx(9.576, abs=0.02)
    assert values[Feature.ROUGHNESS] == pytest.approx(0, abs=0.001)
    assert cell.missing == []


def test_nodata_uncovered_and_oversampling_do_not_invent_metrics(tmp_path):
    data = np.tile(np.arange(10) * 10, (10, 1))
    data[:3] = -9999
    product = raster(tmp_path / "void.tif", data)
    (void,) = list(build_cells(product, bounds(), 0.01, 10))
    assert void.valid_elevations == 70 and void.measurements == []
    assert len(void.missing) == 4
    (outside,) = list(build_cells(product, bounds(west=0.02, east=0.03), 0.01, 5))
    assert outside.valid_elevations == 0 and outside.measurements == []
    product = raster(tmp_path / "tiny.tif", np.full((10, 10), 100))
    (tiny,) = list(build_cells(product, bounds(north=0.0002, east=0.0002), 0.01, 5))
    assert [m.feature for m in tiny.measurements] == [Feature.ELEVATION]
    assert tiny.valid_gradients == 0


def test_grid_rejects_earth_crs_and_unbounded_request(tmp_path):
    product = raster(tmp_path / "earth.tif", np.ones((10, 10)), "EPSG:4326")
    with pytest.raises(ValueError, match="planetary body"):
        list(build_cells(product, bounds(), 0.01, 5))
    with pytest.raises(ValueError, match="at most 400"):
        list(grid_bounds(bounds(), 1e-40))


def test_grid_pagination_and_preserved_point_contract(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.analog_api.main import create_app

    monkeypatch.delenv("ANALOG_FEATURE_OVERLAY", raising=False)
    monkeypatch.delenv("ANALOG_EMBEDDING_MODEL", raising=False)
    with TestClient(create_app()) as client:
        mars = client.get("/api/planetary-cells?body=mars&limit=200").json()
        moon = client.get("/api/planetary-cells?body=moon&offset=11&limit=1").json()
        assert len(mars) == 112 and len(moon) == 1
        assert all(len(cell["measurements"]) == 4 for cell in mars + moon)
        assert len(client.get("/api/planetary-points").json()) == 3
        assert client.get("/api/planetary-cells?limit=999").status_code == 422


def test_independent_evaluation_and_source_reuse_guard():
    catalog = load_catalog()
    judgements = TypeAdapter(list[Judgement]).validate_json(DEFAULT_QUERIES.read_bytes())
    result = evaluate(catalog, judgements)
    assert result["retrieval"]["documented_hit_at_3"] == 4
    assert result["case_blind_screening"]["documented_hit_at_3"] == 2
    assert result["folds"][0]["case_blind_screening_rank"] is None
    assert result["retrieval_hidden_index"]["documented_hit_at_5"] == 0
    contaminated = judgements[0].model_copy(update={"reference": catalog.sources["raven"].url})
    with pytest.raises(ValueError, match="external"):
        evaluate(catalog, [contaminated])


def test_demonstration_values_are_excluded_from_ranking():
    catalog = load_catalog()
    rows = [m.model_copy(update={"value_origin": "demonstration"}) for m in catalog.features.earth["aktau"]]
    features = catalog.features.model_copy(update={"earth": {"aktau": rows}})
    request = RecommendRequest(mission={"objectives": [
        {"category": "terrain", "constraints": [{"feature": "slope_p90_deg", "min": 10}]}
    ], "countries": ["Kazakhstan"]})
    result = rank(replace(catalog, features=features), request).results[0]
    assert not result.recommendations
    assert all(row.suitability_index is None for row in result.needs_data)


def test_declared_product_coverage_masks_pixels(tmp_path):
    product = raster(tmp_path / "valid.tif", np.full((10, 10), 111))
    declared = product.model_copy(update={"latitude_range": (-90, -80)})
    (cell,) = list(build_cells(declared, bounds(), 0.01, 7))
    assert cell.valid_elevations == 0
    assert len(cell.missing) == 4


def test_grouped_retrieval_returns_one_result_for_related_sites():
    from backend.analog_api.retrieval import search_cases

    catalog = load_catalog()
    matches = search_cases(catalog, "lunar rover EVA volcanic field Apollo Arizona", limit=20)
    groups = [catalog.sites[m.case.site_id].site_group for m in matches]
    assert groups.count("northern-arizona") == 1
    assert len(groups) == len(set(groups))
