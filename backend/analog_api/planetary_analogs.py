"""Match a prepared planetary terrain cell to Earth patches at similar ground scales."""
from math import cos, radians
from pathlib import Path
from typing import Literal

from pydantic import Field, TypeAdapter

from .catalog import DATA, Catalog
from .models import CellBounds, EvidenceSource, Feature, Measurement, Model, Number, PlanetaryCell, Point, Text
from .overlays import CellPolygon, bounds_polygon
from .spatial import contains, inside
from .spatial_models import SearchGrid

EARTH_PATCHES = DATA / "earth_terrain_patches.json"
EARTH_DEM = "copernicus_glo90"
TERRAIN_FEATURES = (Feature.SLOPE, Feature.RELIEF, Feature.ROUGHNESS)
SCORE_FLOORS = {Feature.SLOPE: 1.0, Feature.RELIEF: 10.0, Feature.ROUGHNESS: 3.0}
MAX_SCALE_DIFFERENCE = 0.15


class TerrainFootprint(Model):
    east_west_m: Number = Field(gt=0)
    north_south_m: Number = Field(gt=0)
    samples_per_axis: int = Field(ge=3, le=51)


SCALES = {
    "mars_3_5km": TerrainFootprint(east_west_m=3400, north_south_m=3500, samples_per_axis=7),
    "mars_7km": TerrainFootprint(east_west_m=6900, north_south_m=7100, samples_per_axis=11),
    "moon_1_3km": TerrainFootprint(east_west_m=1300, north_south_m=1210, samples_per_axis=11),
}
PLANETARY_SCALES = {
    ("mars", "mola"): (3396190, ("mars_3_5km", "mars_7km")),
    ("moon", "lola"): (1737400, ("moon_1_3km",)),
}


class EarthTerrainPatch(Model):
    cell_id: Text
    point: Point
    bounds: CellBounds
    values: dict[Feature, Number]


def load_terrain_patches(path: Path = EARTH_PATCHES) -> dict[str, dict[str, EarthTerrainPatch]]:
    rows = TypeAdapter(dict[str, list[EarthTerrainPatch]]).validate_json(path.read_bytes())
    result = {}
    for scale, patches in rows.items():
        index = {patch.cell_id: patch for patch in patches}
        if scale not in SCALES or len(index) != len(patches) or any(
            not inside(patch.point, patch.bounds) or set(patch.values) - set(TERRAIN_FEATURES)
            or any(value < 0 or feature == Feature.SLOPE and value > 90 for feature, value in patch.values.items())
            for patch in patches
        ):
            raise ValueError(f"Invalid Earth terrain patches for {scale}.")
        result[scale] = index
    return result


class PlanetaryCellSelection(Model):
    body: Literal["mars", "moon"]
    bounds: CellBounds
    source_id: Text
    samples_per_axis: int = Field(ge=3, le=51, strict=True)


class PlanetaryAnalogRequest(Model):
    target: PlanetaryCellSelection
    features: list[Feature] = Field(default_factory=lambda: list(TERRAIN_FEATURES), min_length=1, max_length=12)
    regions: list[Text] = Field(default_factory=list, max_length=32)
    include_documented_cells: bool = True
    one_per_region: bool = False
    limit: int = Field(default=5, ge=1, le=15, strict=True)


class SkippedFeature(Model):
    feature: Feature
    reason: Literal["incompatible_datum", "unsupported_feature", "missing_target_measurement", "unsupported_scale"]


class TerrainComparison(Model):
    target: Measurement
    earth_value: Number
    absolute_difference: Number
    similarity: Number = Field(ge=0, le=1)


class EarthAnalogCandidate(Model):
    patch: EarthTerrainPatch
    region_id: Text
    geometry: CellPolygon
    similarity_index: Number = Field(ge=0, le=100)
    comparisons: list[TerrainComparison]
    documented_site_ids: list[str]


class PlanetaryAnalogResponse(Model):
    status: Literal["ranked", "insufficient_comparable_data"]
    target: PlanetaryCell
    target_footprint: TerrainFootprint | None
    earth_reference_scale: TerrainFootprint | None
    compared_features: list[Feature]
    skipped_features: list[SkippedFeature]
    eligible_earth_cells: int
    compared_earth_cells: int
    candidates: list[EarthAnalogCandidate]
    sources: list[EvidenceSource]
    limitations: list[Text]


def select_cell(catalog: Catalog, selection: PlanetaryCellSelection) -> PlanetaryCell:
    selected_bounds = selection.bounds.model_dump()
    for cell in catalog.features.planetary_cells:
        if ((cell.body, cell.source_id, cell.samples_per_axis)
                == (selection.body, selection.source_id, selection.samples_per_axis)
                and all(abs(getattr(cell.bounds, field) - value) <= 1e-8 for field, value in selected_bounds.items())):
            return cell
    raise LookupError("Selected planetary cell is outside prepared coverage or its source or sample count differs.")


def matching_scale(cell: PlanetaryCell) -> tuple[TerrainFootprint | None, str | None]:
    product = PLANETARY_SCALES.get((cell.body, cell.source_id))
    if product is None:
        return None, None
    radius, scale_ids = product
    b = cell.bounds
    footprint = TerrainFootprint(
        east_west_m=radius * cos(radians(cell.point.lat)) * radians(b.east - b.west),
        north_south_m=radius * radians(b.north - b.south),
        samples_per_axis=cell.samples_per_axis,
    )
    for scale_id in scale_ids:
        scale = SCALES[scale_id]
        if (scale.samples_per_axis == footprint.samples_per_axis
                and abs(footprint.east_west_m / scale.east_west_m - 1) <= MAX_SCALE_DIFFERENCE
                and abs(footprint.north_south_m / scale.north_south_m - 1) <= MAX_SCALE_DIFFERENCE):
            return footprint, scale_id
    return footprint, None


def find_analogs(catalog: Catalog, grid: SearchGrid, patches_by_scale, request: PlanetaryAnalogRequest) -> PlanetaryAnalogResponse:
    target = select_cell(catalog, request.target)
    regions = {region.id: region for region in grid.regions}
    if unknown := set(request.regions) - regions.keys():
        raise ValueError("Unknown discovery region: " + ", ".join(sorted(unknown)))
    footprint, scale_id = matching_scale(target)
    target_values = {m.feature: m for m in target.measurements if m.value_origin == "derived"}
    compared, skipped = [], []
    for feature in dict.fromkeys(request.features):
        if feature == Feature.ELEVATION:
            reason = "incompatible_datum"
        elif feature not in TERRAIN_FEATURES:
            reason = "unsupported_feature"
        elif feature not in target_values:
            reason = "missing_target_measurement"
        elif scale_id is None:
            reason = "unsupported_scale"
        else:
            compared.append(feature)
            continue
        skipped.append(SkippedFeature(feature=feature, reason=reason))

    patches = patches_by_scale.get(scale_id, {})
    documented_sites = [site for site in catalog.sites.values() if site.status == "documented_analog"]
    eligible = [cell for cell in grid.cells if cell.parent_id and cell.land_eligible
                and (not request.regions or cell.region_id in request.regions)]
    candidates = []
    for cell in eligible if compared else ():
        patch = patches.get(cell.id)
        if (patch is None or patch.point != cell.point or not contains(regions[cell.region_id].bounds, patch.bounds)
                or not all(feature in patch.values for feature in compared)):
            continue
        documented = [site.id for site in documented_sites if inside(site.point, patch.bounds)]
        if documented and not request.include_documented_cells:
            continue
        comparisons = []
        for feature in compared:
            target_measurement = target_values[feature]
            earth, planet = patch.values[feature], target_measurement.value
            difference = abs(earth - planet)
            similarity = 1 - difference / max(earth, planet, SCORE_FLOORS[feature])
            comparisons.append(TerrainComparison(target=target_measurement, earth_value=earth,
                                                 absolute_difference=round(difference, 3), similarity=similarity))
        score = round(100 * sum(row.similarity for row in comparisons) / len(comparisons), 2)
        candidates.append(EarthAnalogCandidate(patch=patch, region_id=cell.region_id, geometry=bounds_polygon(patch.bounds),
                                               similarity_index=score, comparisons=comparisons, documented_site_ids=documented))

    candidates.sort(key=lambda row: (-row.similarity_index, row.patch.cell_id))
    ranked = candidates
    if request.one_per_region:
        by_region: dict[str, EarthAnalogCandidate] = {}
        for candidate in candidates:
            by_region.setdefault(candidate.region_id, candidate)
        ranked = list(by_region.values())
    return PlanetaryAnalogResponse(
        status="ranked" if candidates else "insufficient_comparable_data", target=target, target_footprint=footprint,
        earth_reference_scale=SCALES.get(scale_id), compared_features=compared, skipped_features=skipped,
        eligible_earth_cells=len(eligible), compared_earth_cells=len(candidates), candidates=ranked[:request.limit],
        sources=catalog.source_list([target.source_id, EARTH_DEM] if candidates else [target.source_id]),
        limitations=[
            "Scores average relative terrain similarity for the compared features. They are screening scores, not validation probabilities.",
            "Earth patches are centered on prepared grid cells. Geographically incomplete sampling can miss closer matches.",
            "Sampling footprints match within 15% per axis. Native DEM resolutions and surface types differ.",
            "Terrain similarity alone does not establish comparable climate, geology, safety, or site accessibility.",
        ],
    )
