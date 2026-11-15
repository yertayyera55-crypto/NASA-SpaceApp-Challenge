from dataclasses import replace
from hashlib import sha256

from fastapi.testclient import TestClient

from backend.analog_api.catalog import load_catalog
from backend.analog_api.lithology import GLIM, mapped_lithology
from backend.analog_api.main import create_app
from backend.analog_api.models import Point, RecommendRequest
from backend.analog_api.ranking import rank


def test_real_glim_asset_and_uncovered_sample():
    assert sha256(GLIM.read_bytes()).hexdigest() == "43b4ce3276b155d804db8ff9fb227d620b4c35015a4cf564eac4d06d2b69d88e"
    assert mapped_lithology(Point(lat=43.3579, lon=79.087)).value == "sc"
    assert mapped_lithology(Point(lat=0, lon=-140)) is None


def test_environmental_ranking_independent_of_names_and_publications():
    catalog = load_catalog()
    masked = replace(catalog, cases=(), sites={
        site.id: site.model_copy(update={"name": "Anonymous", "observations": []})
        for site in catalog.sites.values()
    })
    request = RecommendRequest(ranking_mode="environmental", mission={"objectives": [
        {"category": "geology", "traits": ["basalt"]},
        {"category": "terrain", "preferences": [{"feature": "slope_p90_deg", "direction": "higher"}]},
    ]})
    original = rank(catalog, request).results
    hidden = rank(masked, request).results
    for old, new in zip(original, hidden):
        assert [(r.site.point, r.suitability_index) for r in old.recommendations] == [
            (r.site.point, r.suitability_index) for r in new.recommendations
        ]
    assert original[0].recommendations[0].criteria[0].measurement.source_id == "glim"


def test_missing_preference_is_not_a_favorable_match():
    catalog = load_catalog()
    site = catalog.sites["ustyurt"]
    original = catalog.features.earth[site.id]
    request = RecommendRequest(ranking_mode="environmental", mission={"countries": ["Kazakhstan"], "objectives": [
        {"category": "atmosphere", "traits": ["aeolian_landforms"]},
        {"category": "subsurface", "traits": ["lava_caves"]},
    ]}, limit=20)
    def result(rows):
        features = catalog.features.model_copy(update={"earth": {**catalog.features.earth, site.id: rows}})
        return rank(replace(catalog, features=features), request).results
    full = next(r for r in result(original)[0].recommendations if r.site.id == site.id)
    partial = next(r for r in result([m for m in original if m.feature != "bare_cover_pct"])[0].recommendations if r.site.id == site.id)
    assert partial.suitability_index < full.suitability_index
    assert partial.data_coverage == 0.5
    assert partial.missing == ["bare_cover_pct"]
    assert not result(original)[1].recommendations


def test_coordinate_endpoint_uses_unpublished_coordinates(monkeypatch):
    from backend.analog_api import main

    point = Point(lat=43.3579, lon=79.087)
    monkeypatch.setattr(main, "collect_products", lambda p, _: ([mapped_lithology(p)], ["srtm", "power"]))
    with TestClient(create_app(load_catalog())) as client:
        response = client.post("/api/discover", json={"point": point.model_dump(), "mission": {
            "countries": ["Kazakhstan"], "objectives": [
                {"category": "geology", "traits": ["sedimentary_outcrops"]},
                {"category": "terrain", "constraints": [{"feature": "slope_p90_deg", "min": 12}]},
            ]}})
    response.raise_for_status()
    data = response.json()
    assert data["candidate"]["cases"] == []
    assert data["candidate"]["site"]["point"] == point.model_dump()
    assert data["objectives"][0]["status"] == "ranked"
    assert data["objectives"][1]["status"] == "needs_data"
    assert data["objectives"][1]["suitability_index"] is None
    assert data["unavailable_products"] == ["srtm", "power"]


def test_overlay_footprint_order():
    with TestClient(create_app(load_catalog())) as client:
        data = client.get("/api/planetary-overlays?body=moon&limit=1").json()
    feature = data["features"][0]
    b = feature["properties"]["bounds"]
    ring = feature["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1] == [b["west"], b["south"]]
    assert ring[2] == [b["east"], b["north"]]


def test_deduplicate_same_group_and_purpose(tmp_path):
    import json
    from pathlib import Path
    import shutil

    data = Path("backend/data")
    for name in ("features.json", "sources.json", "sites.json"):
        shutil.copyfile(data / name, tmp_path / name)
    cases = json.loads((data / "cases.json").read_text())
    original = next(row for row in cases if row["id"] == "meteor-impact-melts")
    cases.append(dict(original, id="same-regional-purpose", site_id="sp-mountain", source_id="sp_field_guide"))
    (tmp_path / "cases.json").write_text(json.dumps(cases))
    assert {c.id for c in load_catalog(tmp_path).cases} == {c.id for c in load_catalog().cases}
