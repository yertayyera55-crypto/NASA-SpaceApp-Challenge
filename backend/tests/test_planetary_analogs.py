import pytest
from fastapi.testclient import TestClient

from backend.analog_api.main import create_app


@pytest.fixture(scope="module")
def api():
    with TestClient(create_app()) as client:
        yield client


def selection(api, body, samples):
    overlays = api.get("/api/planetary-overlays", params={"body": body, "limit": 200}).json()["features"]
    cell = next(row["properties"] for row in overlays if row["properties"]["samples_per_axis"] == samples)
    return cell, {key: cell[key] for key in ("body", "bounds", "source_id", "samples_per_axis")}


@pytest.mark.parametrize(("body", "source", "count"), [("mars", "mola", 524), ("moon", "lola", 530)])
def test_map_selection_returns_ranked_earth_patches(api, body, source, count):
    cell, target = selection(api, body, 11)
    response = api.post("/api/discover/planetary-analogs", json={"target": target, "limit": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["target"] == cell
    assert data["status"] == "ranked" and data["compared_earth_cells"] == count
    assert {item["id"] for item in data["sources"]} == {source, "copernicus_glo90"}
    assert set(data["compared_features"]) == {"slope_p90_deg", "local_relief_m", "detrended_roughness_rms_m"}
    scores = []
    assert len(data["candidates"]) == 3
    for row in data["candidates"]:
        patch = row["patch"]
        assert row["geometry"]["coordinates"][0][0] == [patch["bounds"]["west"], patch["bounds"]["south"]]
        for item in row["comparisons"]:
            assert item["target"] in cell["measurements"]
            assert item["earth_value"] == patch["values"][item["target"]["feature"]]
            assert item["absolute_difference"] == pytest.approx(abs(item["earth_value"] - item["target"]["value"]), abs=0.001)
        scores.append(row["similarity_index"])
    assert scores == sorted(scores, reverse=True)


def test_unsupported_features_reported_and_regions_filter_earth_patches(api):
    _, target = selection(api, "mars", 7)
    data = api.post("/api/discover/planetary-analogs", json={
        "target": target, "regions": ["ili-basin"],
        "features": ["slope_p90_deg", "elevation_m", "hourly_air_temperature_min_c"],
    }).json()
    assert data["status"] == "ranked" and data["compared_earth_cells"] == 64
    assert data["compared_features"] == ["slope_p90_deg"]
    assert data["skipped_features"] == [
        {"feature": "elevation_m", "reason": "incompatible_datum"},
        {"feature": "hourly_air_temperature_min_c", "reason": "unsupported_feature"},
    ]
    assert all(row["region_id"] == "ili-basin" for row in data["candidates"])


def test_unmatched_scale_and_nonexistent_cell_abstain(api):
    _, target = selection(api, "moon", 7)
    data = api.post("/api/discover/planetary-analogs", json={"target": target}).json()
    assert data["status"] == "insufficient_comparable_data"
    assert {row["reason"] for row in data["skipped_features"]} == {"unsupported_scale"}
    assert data["compared_earth_cells"] == 0 and data["candidates"] == []
    missing = api.post("/api/discover/planetary-analogs", json={"target": target | {"source_id": "mola"}})
    assert missing.status_code == 404
