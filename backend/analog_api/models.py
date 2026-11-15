from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


Number = Annotated[float, Field(strict=True)]
Text = Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class Category(StrEnum):
    GEOLOGY = "geology"
    TERRAIN = "terrain"
    TEMPERATURE = "temperature"
    WATER = "water"
    ATMOSPHERE = "atmosphere"
    BIOLOGY = "biology"
    SUBSURFACE = "subsurface"
    OPERATIONS = "operations"


class Feature(StrEnum):
    ELEVATION = "elevation_m"
    SLOPE = "slope_p90_deg"
    RELIEF = "local_relief_m"
    ROUGHNESS = "detrended_roughness_rms_m"
    AIR_MEAN = "air_temperature_mean_c"
    AIR_COLDEST_MONTH = "coldest_month_mean_air_temperature_c"
    AIR_HOURLY_MIN = "hourly_air_temperature_min_c"
    SURFACE_WATER = "mapped_surface_water_pct"
    PRECIPITATION = "mean_precipitation_mm_day"
    BARE_COVER = "bare_cover_pct"
    WIND = "mean_wind_speed_10m_m_s"
    ICE_DEPTH = "observed_ground_ice_depth_cm"
    LITHOLOGY = "earth_lithology_class"
    GEOLOGIC_UNIT = "mapped_geologic_unit"


class Trait(StrEnum):
    BASALT = "basalt"
    SEDIMENTARY = "sedimentary_outcrops"
    CHALLENGING_TERRAIN = "mobility_hazards"
    COLD = "polar_cold"
    ARID = "aridity"
    GROUND_ICE = "ground_ice"
    AEOLIAN = "aeolian_landforms"
    EVAPORITES = "evaporites"
    LOW_BIOMASS = "low_biomass_soil"
    CAVES = "lava_caves"
    PERMAFROST = "dry_permafrost"
    ROVER = "rover_field_test"
    EVA = "eva_training"


class Point(Model):
    lat: Annotated[Number, Field(ge=-90, le=90)]
    lon: Annotated[Number, Field(ge=-180, le=180)]


class PlanetTarget(Model):
    body: Literal["mars", "moon"]
    point: Point | None = None


class EvidenceSource(Model):
    id: Text
    title: Text
    url: Annotated[str, StringConstraints(pattern=r"^https://\S+$")]
    kind: Literal["study", "technical_report", "product", "observation", "visualization", "repository"]
    access: Text | None = None
    attribution: Text | None = None


ValueOrigin = Literal["observed", "derived", "estimated", "demonstration", "unknown"]


class Measurement(Model):
    feature: Feature
    value: Number | Text
    unit: Text
    source_id: Text
    period: Text
    resolution: Text
    method: Text
    point: Point
    statistic_group: Text
    value_origin: ValueOrigin = "unknown"
    limitations: list[Text] = Field(default_factory=list)


class FeatureTable(Model):
    earth: dict[str, list[Measurement]] = Field(default_factory=dict)
    planetary: list["PlanetaryRow"] = Field(default_factory=list)
    planetary_cells: list["PlanetaryCell"] = Field(default_factory=list)


class PlanetaryRow(Model):
    body: Literal["mars", "moon"]
    point: Point
    measurements: list[Measurement]


class CellBounds(Model):
    south: Annotated[Number, Field(ge=-90, le=90)]
    west: Annotated[Number, Field(ge=-180, le=180)]
    north: Annotated[Number, Field(ge=-90, le=90)]
    east: Annotated[Number, Field(ge=-180, le=180)]

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.south >= self.north or self.west >= self.east:
            raise ValueError("Expected increasing latitude and longitude bounds.")
        return self


class PlanetaryCell(Model):
    body: Literal["mars", "moon"]
    point: Point
    bounds: CellBounds
    source_id: Text
    asset: Text
    samples_per_axis: Annotated[int, Field(ge=3, le=51)]
    valid_elevations: int = Field(ge=0)
    valid_gradients: int = Field(ge=0)
    measurements: list[Measurement]
    missing: list[Feature]

    @model_validator(mode="after")
    def valid_coverage(self) -> Self:
        sample_count = self.samples_per_axis ** 2
        gradient_count = (self.samples_per_axis - 2) ** 2
        if self.valid_elevations > sample_count or self.valid_gradients > gradient_count:
            raise ValueError("Cell coverage exceeds the sampling grid.")
        if (abs(self.point.lat - (self.bounds.south + self.bounds.north) / 2) > 1e-8
                or abs(self.point.lon - (self.bounds.west + self.bounds.east) / 2) > 1e-8):
            raise ValueError("Cell point must be the geographic midpoint.")
        universe = {Feature.ELEVATION, Feature.SLOPE, Feature.RELIEF, Feature.ROUGHNESS}
        present = {m.feature for m in self.measurements}
        if len(present) != len(self.measurements) or set(self.missing) != universe - present or present - universe:
            raise ValueError("Cell metrics and missing features must partition the terrain feature set.")
        return self


class Observation(Model):
    trait: Trait
    detail: Text
    source_id: Text


class CaseMatch(Model):
    case: "Case"
    source: EvidenceSource
    relevance: Number = Field(ge=0, le=1)


class Site(Model):
    id: Text
    name: Text
    country: Text
    point: Point
    coordinate_note: Text
    status: Literal["documented_analog", "screening_candidate"]
    site_group: Text
    source_ids: list[Text]
    observations: list[Observation] = Field(default_factory=list)
    limitations: list[Text] = Field(min_length=1)


class Case(Model):
    id: Text
    site_id: Text
    title: Text
    research_objective: Text
    selection_rationale: Text
    environment: list[Text] = Field(min_length=1)
    experiment: Text
    source_id: Text
    target_bodies: list[Literal["mars", "moon"]]
    purpose_id: Text | None = None
    categories: list[Category] = Field(min_length=1)
    limitations: list[Text] = Field(min_length=1)


class Constraint(Model):
    feature: Feature
    min: Number | None = None
    max: Number | None = None
    min_exclusive: bool = False
    max_exclusive: bool = False
    statistic_group: Text | None = None

    @model_validator(mode="after")
    def valid_range(self) -> Self:
        from .science import FEATURES
        spec = FEATURES[self.feature]
        bounds = [value for value in (self.min, self.max) if value is not None]
        if spec.unit == "class" or not bounds or any(not spec.minimum <= v <= spec.maximum for v in bounds):
            raise ValueError(f"Provide numeric bounds within the range for {self.feature.value}.")
        if (self.min_exclusive and self.min is None) or (self.max_exclusive and self.max is None):
            raise ValueError("An exclusive boundary requires a value.")
        if self.min is not None and self.max is not None and (
            self.min > self.max or self.min == self.max and (self.min_exclusive or self.max_exclusive)
        ):
            raise ValueError("Empty numeric interval.")
        return self


class Preference(Model):
    feature: Feature
    direction: Literal["higher", "lower"]
    statistic_group: Text | None = None


class Objective(Model):
    category: Category
    description: Text | None = None
    clarification_required: bool = False
    constraints: list[Constraint] = Field(default_factory=list, max_length=10)
    preferences: list[Preference] = Field(default_factory=list, max_length=10)
    traits: list[Trait] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def valid_criteria(self) -> Self:
        from .science import CATEGORIES, FEATURES
        spec = CATEGORIES[self.category]
        features = [criterion.feature for criterion in [*self.constraints, *self.preferences]]
        if len(set(features)) != len(features) or len(set(self.traits)) != len(self.traits):
            raise ValueError("Use each feature or trait at most once per objective.")
        if any(f not in spec.features or FEATURES[f].unit == "class" for f in features):
            raise ValueError("A feature is incompatible with this category.")
        if any(t not in spec.traits for t in self.traits):
            raise ValueError("A trait is incompatible with this category.")
        return self


class Mission(Model):
    target: PlanetTarget | None = None
    objectives: list[Objective] = Field(min_length=1, max_length=8)
    countries: list[Annotated[str, StringConstraints(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=30)
    include_screening: bool = True


class InterpretRequest(Model):
    query: Annotated[str, StringConstraints(min_length=2, max_length=1000)]
    target: PlanetTarget | None = None
    countries: list[Annotated[str, StringConstraints(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=30)
    include_screening: bool = True


class Interpretation(Model):
    mission: Mission | None
    provider: Literal["rules", "rules_and_gemini"]
    review: list[Text]


class RecommendRequest(Model):
    mission: Mission
    ranking_mode: Literal["catalog", "environmental"] = "catalog"
    limit: int = Field(default=5, strict=True, ge=1, le=20)


class DiscoveryRequest(Model):
    point: Point
    mission: Mission
    limit: int = Field(default=5, strict=True, ge=1, le=20)


class CriterionResult(Model):
    feature: Feature | None = None
    trait: Trait | None = None
    status: Literal["met", "failed", "observed", "scored", "unavailable"]
    points: Number | None = Field(None, ge=0, le=1)
    detail: Text
    measurement: Measurement | None = None
    observation: Observation | None = None


class SiteResult(Model):
    site: Site
    suitability_index: Number | None = Field(None, ge=0, le=100)
    data_coverage: Number = Field(ge=0, le=1)
    status: Literal["ranked", "needs_data", "constraint_failed"]
    criteria: list[CriterionResult]
    missing: list[Text]
    limitations: list[Text]
    cases: list[Case]
    sources: list[EvidenceSource]


class ObjectiveResult(Model):
    objective_id: int
    objective: Objective
    evaluated_sites: int
    recommendations: list[SiteResult]
    needs_data: list[SiteResult]
    excluded: list[SiteResult]


class PortfolioSite(Model):
    site_id: str
    objective_ids: list[int]


class PlanetContext(Model):
    target: PlanetTarget
    containing_cells: list[PlanetaryCell] = Field(default_factory=list)
    measurements: list[Measurement]
    missing: list[Feature]
    sources: list[EvidenceSource]
    limitations: list[Text]


class Recommendation(Model):
    mission: Mission
    results: list[ObjectiveResult]
    portfolio: list[PortfolioSite]
    uncovered_objective_ids: list[int]
    planetary_context: PlanetContext | None = None
    methodology: Text


class DiscoveryResponse(Model):
    candidate: "SiteProfile"
    unavailable_products: list[Text]
    objectives: list[SiteResult]
    comparison: Recommendation


class SiteProfile(Model):
    site: Site
    measurements: list[Measurement]
    cases: list[Case]
    sources: list[EvidenceSource]


class Health(Model):
    status: Literal["ok"] = "ok"
    sites: int
    cases: int
    earth_measurements: int
    planetary_rows: int
    planetary_cells: int = 0
    gemini_configured: bool
