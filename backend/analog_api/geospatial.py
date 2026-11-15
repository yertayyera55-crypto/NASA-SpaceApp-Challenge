"""Regional numeric extraction. Import this module only for data preparation."""

import csv
import json
from datetime import UTC, datetime, timedelta
from math import atan2, degrees, floor, hypot, isfinite, log, pi, radians, tan
from pathlib import Path

import httpx
import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer
from rasterio.errors import RasterioIOError
from rasterio.windows import Window

from .earth import SRTM_URL
from .models import Feature as F, Measurement, PlanetaryRow, Point
from .science import PLANET_DATASETS

WGS84 = Geod(ellps="WGS84")
MOLA_TIFF = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
WORLDCOVER_BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"


def terrain_grid(point: Point) -> list[tuple[float, float]]:
    offsets = range(-360, 361, 90)
    points = []
    for north in offsets:
        for east in offsets:
            azimuth = degrees(atan2(east, north))
            lon, lat, _ = WGS84.fwd(point.lon, point.lat, azimuth, hypot(north, east))
            points.append((lat, lon))
    return points


def srtm_window(client: httpx.Client, point: Point) -> list[Measurement]:
    """Sample a 9×9 grid with 90 m spacing, centered on the site."""
    if not -55.99 < point.lat < 59.99:
        return []
    points = terrain_grid(point)
    response = client.get(SRTM_URL, params={"locations": "|".join(f"{lat:.8f},{lon:.8f}" for lat, lon in points)})
    response.raise_for_status()
    data = response.json()
    if data.get("status") != "OK" or len(data.get("results", [])) != len(points):
        raise ValueError("Unexpected SRTM response.")
    values = []
    for item, (lat, lon) in zip(data["results"], points, strict=True):
        if (item["dataset"] != "srtm30m" or abs(item["location"]["lat"] - lat) > 1e-6
                or abs(item["location"]["lng"] - lon) > 1e-6):
            raise ValueError("Unexpected SRTM sample metadata.")
        values.append(item["elevation"])
    z = np.asarray(values, dtype=float).reshape(9, 9)
    z[z < -1000] = np.nan
    return dem_measurements(
        point, z, 90.0, 90.0, "srtm", "2000 mission acquisition",
        "1 arc-second (~30 m native); sampled every 90 m", "terrain_grid_90m_720m",
        "EGM96 heights. A 720 m × 720 m grid with a 180 m slope derivative baseline.",
    )


def dem_measurements(point, z, dx, dy, source, period, resolution, group, limitation):
    center = z[z.shape[0] // 2, z.shape[1] // 2]
    rows = []
    metadata = dict(source_id=source, point=point, period=period, resolution=resolution,
                    statistic_group=group, value_origin="derived", limitations=[limitation])
    if isfinite(center):
        elevation_metadata = metadata | {"statistic_group": f"{source}_native_elevation"}
        rows.append(Measurement(feature=F.ELEVATION, value=float(center), unit="m",
                                method="Center elevation sample", **elevation_metadata))
    if dx <= 0 or dy <= 0 or min(z.shape) < 3:
        return rows
    ew = (z[1:-1, 2:] - z[1:-1, :-2]) / (2 * dx)
    ns = (z[2:, 1:-1] - z[:-2, 1:-1]) / (2 * dy)
    valid = np.isfinite(ew) & np.isfinite(ns) & np.isfinite(z[1:-1, 1:-1])
    if valid.size and np.mean(valid) >= 0.8:
        slopes = np.degrees(np.arctan(np.hypot(ew[valid], ns[valid])))
        rows.append(Measurement(feature=F.SLOPE, value=round(float(np.percentile(slopes, 90)), 3), unit="deg",
                                method=f"P90 central-difference gradient magnitude ({np.count_nonzero(valid)}/{valid.size} valid cells)",
                                **metadata))
    return rows


def native_window(dataset, x, y, radius):
    if dataset.transform.b != 0 or dataset.transform.d != 0:
        raise ValueError("Use a north-up raster with aligned axes.")
    row, col = dataset.index(x, y)
    if not (0 <= row < dataset.height and 0 <= col < dataset.width):
        return None, row, col
    window = Window(col - radius, row - radius, 2 * radius + 1, 2 * radius + 1)
    raw = dataset.read(1, window=window, masked=True, boundless=True)
    # GDAL can fill the off-raster portion with zeros for a source without nodata.
    z = raw.astype(float).filled(np.nan)
    yi, xi = np.indices(z.shape)
    valid = ((yi + row - radius >= 0) & (yi + row - radius < dataset.height)
             & (xi + col - radius >= 0) & (xi + col - radius < dataset.width))
    z[~valid] = np.nan
    return z, row, col


def read_dem(uri: str, point: Point, source: str, period: str, resolution: str, group: str,
             limitation: str, radius: int = 4, expected_body: str = "earth") -> list[Measurement]:
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF",
                      GDAL_HTTP_TIMEOUT="25"), rasterio.open(uri) as ds:
        if ds.count != 1 or ds.crs is None or ds.colorinterp[0].name == "palette":
            raise ValueError("A georeferenced single-band numeric DEM is required.")
        crs = CRS.from_user_input(ds.crs)
        geographic = crs.geodetic_crs
        geod = geographic.get_geod()
        expected_radius = {"earth": 6378137, "mars": 3396190, "moon": 1737400}[expected_body]
        if abs(geod.a - expected_radius) / expected_radius > 0.005:
            raise ValueError(f"Raster coordinate reference system is inconsistent with {expected_body}.")
        transform = Transformer.from_crs(geographic, crs, always_xy=True)
        lon = -180 if point.lon == 180 else point.lon
        if crs.is_geographic and ds.bounds.left >= 0:
            lon %= 360
        x, y = transform.transform(lon, point.lat)
        if not isfinite(x) or not isfinite(y):
            return []
        z, row, col = native_window(ds, x, y, radius)
        if z is None:
            return []
        units = ds.units[0]
        if units is not None and units.casefold() not in {"m", "meter", "meters", "metre", "metres"}:
            raise ValueError("The configured DEM must store elevations in meters.")
        z = z * ds.scales[0] + ds.offsets[0]
        center_x, center_y = ds.xy(row, col)
        deltas = (ds.xy(row, col + 1), ds.xy(row + 1, col))
        inverse = Transformer.from_crs(crs, geographic, always_xy=True)
        center_lon, center_lat = inverse.transform(center_x, center_y)
        steps = (geod.inv(center_lon, center_lat, *inverse.transform(px, py))[2] for px, py in deltas)
        dx, dy = steps
        if abs(point.lat) == 90 and crs.is_geographic:
            dx = 0
        return dem_measurements(point, z, dx, dy, source, period, resolution, group, limitation)


def copernicus_window(point: Point) -> list[Measurement]:
    lat, lon = floor(point.lat), floor(point.lon if point.lon < 180 else -180)
    tile = f"{'N' if lat >= 0 else 'S'}{abs(lat):02}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03}_00"
    name = f"Copernicus_DSM_COG_10_{tile}_DEM"
    uri = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
    points = terrain_grid(point)
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="25"), rasterio.open(uri) as ds:
            if ds.count != 1 or ds.crs is None or ds.crs.to_epsg() != 4326:
                raise ValueError("Expected a single-band Copernicus GLO-30 WGS84 tile.")
            indices = [ds.index(lon, lat) for lat, lon in points]
            row_min = max(0, min(row for row, _ in indices))
            col_min = max(0, min(col for _, col in indices))
            row_max = min(ds.height, max(row for row, _ in indices) + 1)
            col_max = min(ds.width, max(col for _, col in indices) + 1)
            window = Window(col_min, row_min, col_max - col_min, row_max - row_min)
            native = ds.read(1, window=window, masked=True).astype(float).filled(np.nan)
            z = np.asarray([native[row - row_min, col - col_min]
                            if row_min <= row < row_max and col_min <= col < col_max
                            else np.nan for row, col in indices]).reshape(9, 9)
    except RasterioIOError as exc:
        if "404" in str(exc):
            return []
        raise
    return dem_measurements(
        point, z, 90.0, 90.0, "copernicus_dem", "GLO-30 public 2021 release",
        "Nominal 30 m DSM; sampled every 90 m", "terrain_grid_90m_720m",
        "EGM2008 heights. The DSM includes above-ground surfaces. The 180 m slope baseline smooths local features.",
    )


def worldcover_uri(point: Point) -> str:
    lat = 3 * floor(point.lat / 3)
    lon = 3 * floor((-180 if point.lon == 180 else point.lon) / 3)
    tile = f"{'N' if lat >= 0 else 'S'}{abs(lat):02}{'E' if lon >= 0 else 'W'}{abs(lon):03}"
    return f"{WORLDCOVER_BASE}/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"


def read_worldcover(point: Point, uri: str | None = None) -> list[Measurement]:
    if uri is None and point.lat < -60:
        return []
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                      GDAL_HTTP_TIMEOUT="25"), rasterio.open(uri or worldcover_uri(point)) as ds:
        if ds.count != 1 or ds.crs is None or ds.crs.to_epsg() != 4326:
            raise ValueError("Expected a single-band ESA WorldCover WGS84 class tile.")
        grid, _, _ = native_window(ds, -180 if point.lon == 180 else point.lon, point.lat, 25)
        if grid is None:
            return []
        valid = np.isin(grid, [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100])
        if np.mean(valid) < 0.9:
            return []
        return [Measurement(
            feature=F.BARE_COVER, value=round(100 * float(np.mean(grid[valid] == 60)), 2), unit="%",
            source_id="worldcover", period="2021", point=point, resolution="10 m nominal geographic pixels",
            method="Class 60 fraction in a 51 × 51 pixel window",
            statistic_group="worldcover_2021_v200_51px", value_origin="derived",
            limitations=["Classified land cover only. The window has latitude-dependent east–west ground width."],
        )]


def read_era5_csv(path: Path, point: Point, grid_point: Point) -> list[Measurement]:
    if abs(grid_point.lat - point.lat) > 0.11 or abs((grid_point.lon - point.lon + 180) % 360 - 180) > 0.11:
        raise ValueError("ERA5-Land grid coordinate is too far from the requested point.")
    hours = []
    values = []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            raw_time = row.get("valid_time") or row.get("time")
            raw_temperature = row.get("t2m") or row.get("2m_temperature")
            if raw_time is None or raw_temperature is None:
                raise ValueError("Expected valid_time/time and t2m/2m_temperature columns.")
            time = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
            if time.tzinfo is None:
                time = time.replace(tzinfo=UTC)
            if (time.utcoffset() != timedelta(0) or time.minute or time.second or time.microsecond
                    or hours and time - hours[-1] != timedelta(hours=1)):
                raise ValueError("ERA5-Land input must contain consecutive UTC hours.")
            value = float(raw_temperature)
            if not 163.15 <= value <= 343.15:
                raise ValueError("Expected finite ERA5-Land t2m temperatures in kelvins.")
            hours.append(time)
            values.append(value - 273.15)
    if len(hours) < 24:
        raise ValueError("Require at least 24 consecutive hourly values.")
    period = f"{hours[0].isoformat()} to {hours[-1].isoformat()} UTC"
    return [Measurement(
        feature=F.AIR_HOURLY_MIN, value=round(min(values), 3), unit="degC",
        source_id="era5", point=point, period=period, resolution="0.1° grid, 1-hour analysis interval",
        method=f"Minimum t2m over {len(hours)} UTC samples at grid point ({grid_point.lat:g}, {grid_point.lon:g})",
        statistic_group=f"era5_hourly_{period}", value_origin="derived",
        limitations=["Reanalysis estimate. The sampled interval limits comparability and does not bound local extremes."],
    )]


GEOLOGY_SERVICES = {
    "mars": ("https://services.arcgis.com/nzS0F0zdNLvs7nc8/ArcGIS/rest/services/Mars_Geology_feature_layer/FeatureServer/0/query", "Unit"),
    "moon": ("https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Features_Fortezzo_et_al_2020_Unified_Map_of_the_Moon/FeatureServer/7/query", "FIRST_UnitSymbol"),
}


def official_geologic_unit(client: httpx.Client, point: Point, body: str) -> list[Measurement]:
    lon, lat = (-180 if point.lon == 180 else point.lon), point.lat
    if body == "moon":
        if abs(lat) >= 85:
            return []
        # Native Moon 2000 spherical Mercator from the layer CRS metadata.
        lon, lat = 1737400 * radians(lon), 1737400 * log(tan(pi / 4 + radians(lat) / 2))
    url, field = GEOLOGY_SERVICES[body]
    response = client.get(url, params={
        "f": "json", "geometry": f"{lon:.10f},{lat:.10f}", "geometryType": "esriGeometryPoint",
        "spatialRel": "esriSpatialRelIntersects", "outFields": field, "returnGeometry": "false",
    })
    response.raise_for_status()
    data = response.json()
    if data.get("error") or data.get("exceededTransferLimit"):
        raise ValueError(f"USGS {body} geology service could not resolve the point.")
    matches = {item["attributes"][field] for item in data["features"] if item["attributes"].get(field)}
    return map_unit_measurement(point, body, matches)


def read_geologic_unit(path: Path, point: Point, body: str, field: str) -> list[Measurement]:
    from shapely.geometry import Point as GeometryPoint, shape

    dataset = json.loads(path.read_text())
    if dataset["type"] != "FeatureCollection" or "crs" in dataset:
        raise ValueError("Export a regional GeoJSON in east-positive planetocentric degrees without a CRS member.")
    location = GeometryPoint(point.lon, point.lat)
    matches = {
        item["properties"][field].strip()
        for item in dataset["features"]
        if item["geometry"]["type"] in ("Polygon", "MultiPolygon") and shape(item["geometry"]).covers(location)
        and isinstance(item["properties"].get(field), str) and item["properties"][field].strip()
    }
    return map_unit_measurement(point, body, matches)


def map_unit_measurement(point, body, matches):
    if len(matches) != 1:
        return []
    scale = "1:20,000,000" if body == "mars" else "1:5,000,000"
    return [Measurement(
        feature=F.GEOLOGIC_UNIT, value=matches.pop(), unit="class",
        source_id=PLANET_DATASETS[body].geologic_source, point=point,
        period="USGS SIM 3292 (2014)" if body == "mars" else "Unified Geologic Map v2 (2020)",
        resolution=scale, method="Point intersection against mapped polygon",
        statistic_group=f"{body}_usgs_geologic_unit", value_origin="derived",
        limitations=["Map classification at publication scale. Local lithology or mineral composition may differ."],
    )]


def build_planetary_row(body: str, point: Point, dem: str | None, geology: Path | None, unit_field: str) -> PlanetaryRow:
    spec = PLANET_DATASETS[body]
    measurements = []
    if dem is not None:
        measurements.extend(read_dem(dem, point, spec.source_id, "published DEM product", spec.resolution,
                                     f"{spec.source_id}_native_9px", f"Vertical datum: {spec.datum}.", expected_body=body))
    if geology is not None:
        measurements.extend(read_geologic_unit(geology, point, body, unit_field))
    return PlanetaryRow(body=body, point=point, measurements=measurements)
