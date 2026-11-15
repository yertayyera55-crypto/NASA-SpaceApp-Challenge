from typing import Literal

from pydantic import Field, model_validator

from .models import Category, CellBounds, Measurement, Mission, Model, Point, PortfolioSite, SiteResult, Text
from .overlays import CellPolygon


class SearchRegion(Model):
    id: Text
    name: Text
    country: Text
    bounds: CellBounds


class SearchCell(Model):
    id: Text
    region_id: Text
    parent_id: Text | None = None
    bounds: CellBounds
    point: Point
    measurements: list[Measurement]
    land_eligible: bool


class SearchGrid(Model):
    regions: list[SearchRegion]
    cells: list[SearchCell]


class SpatialSearchRequest(Model):
    mission: Mission
    regions: list[Text] = Field(default_factory=list, max_length=32)
    include_documented_cells: bool = True
    refine_per_objective: int = Field(default=3, ge=1, le=16, strict=True)
    limit: int = Field(default=5, ge=1, le=15, strict=True)

    @model_validator(mode="after")
    def unique_regions(self):
        if len(set(self.regions)) != len(self.regions):
            raise ValueError("List each region once.")
        return self


class SpatialCandidate(Model):
    cell: SearchCell
    geometry: CellPolygon
    evidence_status: Literal["new_screening_candidate", "contains_documented_analog"]
    documented_site_ids: list[str]
    assessments: dict[int, SiteResult]


class SpatialObjective(Model):
    objective_id: int
    category: Category
    coarse_evaluated: int
    fine_evaluated: int
    refined_parent_ids: list[str]
    recommendations: list[str]
    needs_data: int
    missing_requirements: list[str]
    excluded: int
    fine_considered: int


class SpatialSearchResponse(Model):
    mission: Mission
    regions: list[SearchRegion]
    coarse_evaluated: int
    fine_evaluated: int
    objectives: list[SpatialObjective]
    candidates: list[SpatialCandidate]
    portfolio: list[PortfolioSite]
    uncovered_objective_ids: list[int]
    methodology: Text
