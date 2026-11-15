from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.analog_api.catalog import load_catalog
from backend.analog_api.main import create_app
from backend.analog_api.models import RecommendRequest
from backend.analog_api.ranking import rank


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("ANALOG_FEATURE_OVERLAY", raising=False)
    monkeypatch.delenv("ANALOG_EMBEDDING_MODEL", raising=False)
    with TestClient(create_app()) as c:
        yield c


def interpret(client, query):
    response = client.post("/api/interpret", json={"query": query})
    assert response.status_code == 200, response.text
    return response.json()


def recommend(client, mission, limit=5):
    response = client.post("/api/recommend", json={"mission": mission, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()


def site_ids(rows):
    return [row["site"]["id"] for row in rows]


def test_typed_catalog_and_openapi(client):
    health = client.get("/api/health").json()
    assert health == {"status": "ok", "sites": 19, "cases": 15, "earth_measurements": 154,
                      "planetary_rows": 3, "planetary_cells": 196, "gemini_configured": False}
    assert len(client.get("/api/categories").json()) == 8
    assert len(client.get("/api/sites", params={"country": "kAZAKHstan"}).json()) == 5
    assert len(client.get("/api/planetary-points").json()) == 3
    assert client.get("/api/features").json()["slope_p90_deg"]["unit"] == "deg"
    assert client.get("/api/sites/unknown").status_code == 404
    schema = client.get("/openapi.json").json()
    assert "/api/interpret" in schema["paths"]


@pytest.mark.parametrize("query, category, expected", [
    ("Rover mobility on steep slopes", "terrain", "sp-mountain"),
    ("Geological analysis of basaltic formations", "geology", "holuhraun"),
    ("Extreme cold testing", "temperature", "university-valley"),
    ("Astrobiology in arid environments", "biology", "yungay"),
    ("Ground ice depth at most 45 cm", "water", "university-valley"),
    ("Lava caves for subsurface study", "subsurface", "indian-tunnel"),
    ("Crew training and EVA operations", "operations", "cinder-lake"),
    ("Aeolian dune field", "atmosphere", "holuhraun"),
])
def test_scientific_scenarios(client, query, category, expected):
    output = recommend(client, interpret(client, query)["mission"])
    evaluated = next(row for row in output["results"] if row["objective"]["category"] == category)
    top = evaluated["recommendations"][0]
    assert top["site"]["id"] == expected
    assert top["data_coverage"] > 0 and top["sources"] and top["limitations"]
    assert all(r["status"] == "ranked" for r in evaluated["recommendations"])


def test_multi_objective_portfolio_and_planetary_context(client):
    request = interpret(client, "Test rover mobility on steep slopes, unusual basalt geology and extreme cold.")
    assert len(request["mission"]["objectives"]) == 3
    assert all(not obj["constraints"] for obj in request["mission"]["objectives"])
    request["mission"]["target"] = {"body": "mars", "point": {"lat": 18.38, "lon": 77.58}}
    output = recommend(client, request["mission"])
    assert {p["site_id"] for p in output["portfolio"]} == {"sp-mountain", "holuhraun", "university-valley"}
    assert not output["uncovered_objective_ids"]
    context = output["planetary_context"]
    assert {m["source_id"] for m in context["measurements"]} == {"mola", "usgs_mars_geology"}
    assert "air_temperature_mean_c" in context["missing"]
    assert len(context["containing_cells"]) == 2
    request["mission"]["target"]["point"]["lat"] = 18.39
    unknown = recommend(client, request["mission"])
    assert unknown["planetary_context"]["measurements"] == []
    assert "elevation_m" in unknown["planetary_context"]["missing"]
    assert len(unknown["planetary_context"]["containing_cells"]) == 2


def test_explicit_bounds_and_sourced_comparison(client):
    mission = interpret(client, "Slope at least 12° and below 20°")["mission"]
    bound = mission["objectives"][0]["constraints"][0]
    assert (bound["min"], bound["max"], bound["max_exclusive"]) == (12.0, 20.0, True)
    result = recommend(client, mission)["results"][0]
    assert set(site_ids(result["recommendations"])) == {"university-valley", "yungay", "charyn"}
    assert "aktau" in site_ids(result["excluded"])
    assert "dry-valleys" in site_ids(result["needs_data"])
    assert all(r["suitability_index"] is None for r in result["needs_data"] + result["excluded"])

    query = "Annual mean air temperature from -30 to -20 °C"
    thermal = interpret(client, query)["mission"]["objectives"][0]
    assert thermal["constraints"][0]["min"] == -30
    thermal["constraints"][0]["statistic_group"] = "university_station_2010_2013"
    local = recommend(client, {"objectives": [thermal]})["results"][0]
    assert site_ids(local["recommendations"]) == ["university-valley"]
    assert len(local["needs_data"]) == local["evaluated_sites"] - 1


@pytest.mark.parametrize("query", [
    "Temperature below -40 °C",
    "Slope over approximately 15°",
    "Slope above 10° but under 25 percent",
    "Slope at least 30° and at most 10°",
    "Air pressure",
    "Minimum hourly temperature below -40 °F",
])
def test_unresolved_requirements_are_reported_and_block_ranking(client, query):
    result = interpret(client, query)
    assert result["review"]
    objective = result["mission"]["objectives"][0]
    assert objective["clarification_required"]
    assert not recommend(client, result["mission"])["results"][0]["recommendations"]


def test_manual_input_and_missing_measurements(client):
    request = {"objectives": [{"category": "temperature", "constraints": [
        {"feature": "hourly_air_temperature_min_c", "max": -50}
    ]}]}
    output = recommend(client, request)
    assert output["portfolio"] == [] and output["uncovered_objective_ids"] == [1]
    assert len(output["results"][0]["needs_data"]) == output["results"][0]["evaluated_sites"]
    assert client.post("/api/recommend", json={"mission": {"objectives": [
        {"category": "biology", "constraints": [{"feature": "slope_p90_deg", "min": 20}]}
    ]}}).status_code == 422
    assert client.post("/api/recommend", json={"mission": {"objectives": [
        {"category": "terrain", "constraints": [{"feature": "slope_p90_deg", "min": "20"}]}
    ]}}).status_code == 422


def test_kazakhstan_discovery(client):
    mission = interpret(client, "Study aeolian sand dunes and sedimentary outcrops")["mission"]
    mission["countries"] = ["Kazakhstan"]
    output = recommend(client, mission)
    assert {p["site_id"] for p in output["portfolio"]} == {"oyyl", "aktau"}
    assert all(r["recommendations"][0]["site"]["status"] == "screening_candidate" for r in output["results"])
    mission["include_screening"] = False
    assert recommend(client, mission)["portfolio"] == []


def test_duplicate_case_count_cannot_change_score():
    catalog = load_catalog()
    request = RecommendRequest(mission={"objectives": [{"category": "geology", "traits": ["basalt"]}]})
    duplicate = catalog.cases[0].model_copy(update={"id": "republished"})
    original = rank(catalog, request).results[0].recommendations
    augmented = rank(replace(catalog, cases=(*catalog.cases, duplicate)), request).results[0].recommendations
    assert [(r.site.id, r.suitability_index, r.data_coverage) for r in original] == [
        (r.site.id, r.suitability_index, r.data_coverage) for r in augmented
    ]


def test_literature_retrieves_primary_sources(client):
    matches = client.get("/api/cases/search", params={"q": "UAV lava caves", "category": "subsurface"}).json()
    assert matches[0]["case"]["id"] == "krafla-uav"
    assert matches[0]["source"]["url"].startswith("https://")
    matches = client.get("/api/cases/search", params={"q": "lava rover Holuhraun"}).json()
    assert sum(m["case"]["site_id"] == "holuhraun" for m in matches) == 1


def test_gemini_classification_and_offline_fallback(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-token")
    with TestClient(create_app()) as c:
        real = c.app.state.http
        def classify(req):
            assert req.headers["x-goog-api-key"] == "test-token"
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [
                {"text": '{"matches":[{"category":"operations","quote":"field rehearsal"}]}'}
            ]}}]})
        with httpx.Client(transport=httpx.MockTransport(classify)) as mock:
            c.app.state.http = mock
            result = interpret(c, "Run a field rehearsal")
            assert result["provider"] == "rules_and_gemini"
            assert result["mission"]["objectives"][0]["category"] == "operations"
        with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(503))) as offline:
            c.app.state.http = offline
            result = interpret(c, "Rover mobility on slopes")
            assert result["provider"] == "rules" and result["review"]
            assert result["mission"]["objectives"][0]["category"] == "terrain"
        c.app.state.http = real
