from dataclasses import dataclass
from typing import Literal

from .models import Category as C, Feature as F, Model, Trait as T


class FeatureSpec(Model):
    label: str
    unit: str
    minimum: float
    maximum: float
    screening_scale: tuple[float, float] | None = None


FEATURES = {
    F.ELEVATION: FeatureSpec(label="Elevation relative to product datum", unit="m", minimum=-15000, maximum=25000, screening_scale=(0, 4500)),
    F.RELIEF: FeatureSpec(label="Cell maximum minus minimum elevation", unit="m", minimum=0, maximum=40000),
    F.ROUGHNESS: FeatureSpec(label="Cell plane-detrended elevation RMS", unit="m", minimum=0, maximum=40000),
    F.SLOPE: FeatureSpec(label="90th percentile terrain slope", unit="deg", minimum=0, maximum=90, screening_scale=(0, 45)),
    F.AIR_MEAN: FeatureSpec(label="Period mean near-surface air temperature", unit="degC", minimum=-100, maximum=70, screening_scale=(-40, 30)),
    F.AIR_COLDEST_MONTH: FeatureSpec(label="Coldest climatological month mean air temperature", unit="degC", minimum=-100, maximum=70, screening_scale=(-50, 25)),
    F.AIR_HOURLY_MIN: FeatureSpec(label="Minimum of hourly near-surface air temperatures", unit="degC", minimum=-110, maximum=70, screening_scale=(-65, 20)),
    F.SURFACE_WATER: FeatureSpec(label="ESA WorldCover permanent surface-water class fraction", unit="%", minimum=0, maximum=100, screening_scale=(0, 100)),
    F.PRECIPITATION: FeatureSpec(label="Mean daily precipitation", unit="mm/day", minimum=0, maximum=200, screening_scale=(0, 5)),
    F.BARE_COVER: FeatureSpec(label="ESA WorldCover bare/sparse class fraction", unit="%", minimum=0, maximum=100, screening_scale=(0, 100)),
    F.WIND: FeatureSpec(label="Mean 10 m wind speed", unit="m/s", minimum=0, maximum=100, screening_scale=(0, 15)),
    F.ICE_DEPTH: FeatureSpec(label="Observed ground-ice table depth", unit="cm", minimum=0, maximum=10000, screening_scale=(0, 100)),
    F.LITHOLOGY: FeatureSpec(label="GLiM mapped regional rock class", unit="class", minimum=0, maximum=0),
    F.GEOLOGIC_UNIT: FeatureSpec(label="Published geologic map-unit symbol", unit="class", minimum=0, maximum=0),
}


class CategorySpec(Model):
    id: C
    name: str
    features: tuple[F, ...]
    traits: tuple[T, ...]
    default_traits: tuple[T, ...] = ()
    default_direction: tuple[F, Literal["higher", "lower"]] | None = None
    limitations: str


CATEGORIES = {
    spec.id: spec for spec in (
        CategorySpec(id=C.GEOLOGY, name="Geology and Surface Materials",
                     features=(F.GEOLOGIC_UNIT, F.LITHOLOGY, F.BARE_COVER), traits=(T.BASALT, T.SEDIMENTARY, T.EVAPORITES),
                     default_traits=(T.BASALT, T.SEDIMENTARY, T.EVAPORITES),
                     limitations="Land cover and map units cannot establish mineral abundances or particle-size distributions."),
        CategorySpec(id=C.TERRAIN, name="Terrain and Topography",
                     features=(F.SLOPE, F.ELEVATION, F.BARE_COVER), traits=(T.CHALLENGING_TERRAIN,),
                     default_direction=(F.SLOPE, "higher"),
                     limitations="DEM-scale slope is sensitive to pixel size and is insufficient for traverse safety decisions."),
        CategorySpec(id=C.TEMPERATURE, name="Temperature and Environment",
                     features=(F.AIR_MEAN, F.AIR_COLDEST_MONTH, F.AIR_HOURLY_MIN), traits=(T.COLD,),
                     default_direction=(F.AIR_COLDEST_MONTH, "lower"),
                     limitations="Air, ground and hardware temperatures are different variables. Site conditions vary by season and exposure."),
        CategorySpec(id=C.WATER, name="Water and Resources",
                     features=(F.PRECIPITATION, F.ICE_DEPTH, F.SURFACE_WATER), traits=(T.ARID, T.GROUND_ICE, T.EVAPORITES),
                     default_traits=(T.ARID, T.GROUND_ICE, T.EVAPORITES),
                     limitations="Water occurrence does not establish accessible volume or extraction yield."),
        CategorySpec(id=C.ATMOSPHERE, name="Atmospheric and Surface Processes",
                     features=(F.WIND, F.BARE_COVER), traits=(T.AEOLIAN,),
                     default_traits=(T.AEOLIAN,), limitations="Earth wind and landforms do not establish Mars dust flux, pressure, or transport thresholds."),
        CategorySpec(id=C.BIOLOGY, name="Biology and Habitability",
                     features=(F.PRECIPITATION,), traits=(T.LOW_BIOMASS, T.ARID),
                     default_traits=(T.ARID, T.LOW_BIOMASS),
                     limitations="Precipitation and local field observations cannot substitute for water activity or independent habitability measurements."),
        CategorySpec(id=C.SUBSURFACE, name="Subsurface Environments",
                     features=(F.ICE_DEPTH,), traits=(T.CAVES, T.PERMAFROST, T.GROUND_ICE),
                     default_traits=(T.CAVES, T.PERMAFROST, T.GROUND_ICE),
                     limitations="Entrance or ice observations do not establish cave continuity, structural safety, or local ice volume."),
        CategorySpec(id=C.OPERATIONS, name="Exploration and Operations",
                     features=(F.SLOPE, F.BARE_COVER), traits=(T.ROVER, T.EVA, T.CHALLENGING_TERRAIN),
                     default_traits=(T.ROVER, T.EVA, T.CHALLENGING_TERRAIN),
                     limitations="Prior tests do not establish current access, permissions, communications or logistics."),
    )
}


@dataclass(frozen=True)
class PlanetDataset:
    source_id: str
    datum: str
    resolution: str
    geologic_source: str


PLANET_DATASETS = {
    "mars": PlanetDataset("mola", "MOLA areoid", "128 pixels per degree (~463 m at equator)", "usgs_mars_geology"),
    "moon": PlanetDataset("lola", "LOLA reference sphere (1737.4 km radius)", "NASA LOLA 80°S COG, 20 m projected pixels", "usgs_moon_geology"),
}
