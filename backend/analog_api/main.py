from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx

from .catalog import DATA, Catalog, load_catalog
from .interpret import interpret
from .discovery import assess_coordinate, collect_products
from .models import (
    Case, CaseMatch, Category, DiscoveryRequest, DiscoveryResponse, EvidenceSource, Feature, Health, InterpretRequest, Interpretation, PlanetaryCell, PlanetaryRow,
    RecommendRequest, Recommendation, SiteProfile,
)
from .ranking import profile, rank
from .overlays import CellOverlayCollection, cell_overlays
from .planetary_analogs import EARTH_PATCHES, PlanetaryAnalogRequest, PlanetaryAnalogResponse, find_analogs, load_terrain_patches, matching_scale
from .retrieval import LocalSentenceEncoder, search_cases
from .spatial import SEARCH_GRID, load_search_grid, search_regions
from .spatial_models import SearchRegion, SpatialSearchRequest, SpatialSearchResponse
from .science import CATEGORIES, FEATURES, CategorySpec, FeatureSpec

ROOT = DATA.parents[1]
for env_file in (DATA.parent / ".env", ROOT / ".env.local", ROOT / ".env"):
    load_dotenv(env_file)


def create_app(catalog: Catalog | None = None) -> FastAPI:
    origins = os.getenv("ANALOG_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    api_key = os.getenv("GEMINI_API_KEY") or None
    model = os.getenv("GEMINI_MODEL") or "gemini-3.8-flash"
    overlay = os.getenv("ANALOG_FEATURE_OVERLAY")
    embedding_model = os.getenv("ANALOG_EMBEDDING_MODEL")
    search_path = Path(os.getenv("ANALOG_SEARCH_GRID") or SEARCH_GRID)
    terrain_patches_path = Path(os.getenv("ANALOG_TERRAIN_PATCHES") or EARTH_PATCHES)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.catalog = catalog if catalog is not None else load_catalog(overlay=Path(overlay) if overlay else None)
        app.state.search_grid = load_search_grid(app.state.catalog, search_path)
        app.state.terrain_patches = load_terrain_patches(terrain_patches_path)
        app.state.encoder = LocalSentenceEncoder(Path(embedding_model)) if embedding_model else None
        with httpx.Client(timeout=httpx.Timeout(8, connect=3)) as client:
            app.state.http = client
            yield

    app = FastAPI(title="FindY Science API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in origins.split(",") if s.strip()],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/api/health", tags=["Catalog"])
    def health(req: Request) -> Health:
        data = req.app.state.catalog
        return Health(sites=len(data.sites), cases=len(data.cases),
                      earth_measurements=sum(map(len, data.features.earth.values())),
                      planetary_rows=len(data.features.planetary), planetary_cells=len(data.features.planetary_cells),
                      gemini_configured=bool(api_key))

    @app.get("/api/categories", tags=["Catalog"])
    def categories() -> list[CategorySpec]:
        return list(CATEGORIES.values())

    @app.get("/api/features", tags=["Catalog"])
    def features() -> dict[Feature, FeatureSpec]:
        return FEATURES

    @app.get("/api/sources", tags=["Catalog"])
    def sources(req: Request) -> list[EvidenceSource]:
        return list(req.app.state.catalog.sources.values())

    @app.get("/api/cases", tags=["Catalog"])
    def cases(req: Request) -> list[Case]:
        return list(req.app.state.catalog.cases)

    @app.get("/api/cases/search", tags=["Catalog"])
    def literature(req: Request, q: Annotated[str, Query(min_length=2, max_length=500)],
                   category: Category | None = None, limit: Annotated[int, Query(ge=1, le=20)] = 5) -> list[CaseMatch]:
        return search_cases(req.app.state.catalog, q, category, limit, encoder=req.app.state.encoder)

    @app.get("/api/planetary-cells", tags=["Catalog"])
    def planetary_cells(req: Request, body: Literal["mars", "moon"] | None = None,
                        offset: Annotated[int, Query(ge=0)] = 0,
                        limit: Annotated[int, Query(ge=1, le=400)] = 100) -> list[PlanetaryCell]:
        rows = [cell for cell in req.app.state.catalog.features.planetary_cells if body is None or body == cell.body]
        return rows[offset:offset + limit]

    @app.get("/api/planetary-overlays", tags=["Catalog"])
    def planetary_overlays(req: Request, body: Literal["mars", "moon"],
                           offset: Annotated[int, Query(ge=0)] = 0,
                           limit: Annotated[int, Query(ge=1, le=400)] = 100) -> CellOverlayCollection:
        rows = [cell for cell in req.app.state.catalog.features.planetary_cells if body == cell.body]
        patches = req.app.state.terrain_patches
        return cell_overlays(rows[offset:offset + limit], lambda cell: bool(patches.get(matching_scale(cell)[1])))

    @app.get("/api/planetary-points", tags=["Catalog"])
    def planetary_points(req: Request) -> list[PlanetaryRow]:
        return req.app.state.catalog.features.planetary

    @app.get("/api/sites", tags=["Catalog"])
    def sites(req: Request, country: Annotated[str | None, Query(max_length=100)] = None,
              include_screening: bool = True) -> list[SiteProfile]:
        data = req.app.state.catalog
        return [profile(data, site) for site in data.sites.values()
                if (country is None or country.strip().casefold() == site.country.casefold())
                and (include_screening or site.status == "documented_analog")]

    @app.get("/api/sites/{site_id}", tags=["Catalog"])
    def site(req: Request, site_id: str) -> SiteProfile:
        data = req.app.state.catalog
        if site_id not in data.sites:
            raise HTTPException(status_code=404, detail="Site not found.")
        return profile(data, data.sites[site_id])

    @app.post("/api/interpret", tags=["Missions"])
    def interpret_query(req: Request, body: InterpretRequest) -> Interpretation:
        return interpret(body, req.app.state.http, api_key, model)

    @app.post("/api/recommend", tags=["Missions"])
    def recommend(req: Request, body: RecommendRequest) -> Recommendation:
        return rank(req.app.state.catalog, body)

    @app.post("/api/discover", tags=["Missions"])
    def discover(req: Request, body: DiscoveryRequest) -> DiscoveryResponse:
        rows, unavailable = collect_products(body.point, req.app.state.http)
        return assess_coordinate(req.app.state.catalog, body, rows, unavailable)

    @app.get("/api/discovery-regions", tags=["Catalog"])
    def discovery_regions(req: Request) -> list[SearchRegion]:
        return req.app.state.search_grid.regions

    @app.post("/api/discover/regions", tags=["Missions"])
    def discover_regions(req: Request, body: SpatialSearchRequest) -> SpatialSearchResponse:
        try:
            return search_regions(req.app.state.catalog, req.app.state.search_grid, body)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/discover/planetary-analogs", tags=["Missions"])
    def discover_planetary_analogs(req: Request, body: PlanetaryAnalogRequest) -> PlanetaryAnalogResponse:
        state = req.app.state
        try:
            return find_analogs(state.catalog, state.search_grid, state.terrain_patches, body)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return app


app = create_app()
