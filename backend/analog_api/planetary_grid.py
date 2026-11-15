"""Prepare regional planetary terrain cells from numerical elevation rasters."""
from collections.abc import Iterator
from math import ceil, isclose, isfinite
from pathlib import Path
from typing import Literal

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import Window

from .models import CellBounds, Feature, Measurement, Model, Number, PlanetaryCell, Point, Text

Body = Literal["mars", "moon"]
CELL_FEATURES = (Feature.ELEVATION, Feature.SLOPE, Feature.RELIEF, Feature.ROUGHNESS)
BODY_RADII = {"mars": 3396190, "moon": 1737400}
MIN_COVERAGE = 0.8


class DemProduct(Model):
    body: Body
    source_id: Text
    asset: Text
    period: Text
    resolution: Text
    datum: Text
    frame: Text
    meters_per_unit: Number
    offset_m: Number = 0
    latitude_range: tuple[Number, Number] = (-90, 90)



MOLA = DemProduct(
    body="mars", source_id="mola", asset="https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif",
    period="USGS MGS MOLA global DEM", resolution="128 pixels/degree (~463 m at equator)",
    datum="MOLA areoid", frame="Product Mars sphere; east-positive planetocentric degrees", meters_per_unit=1,
)
LOLA = DemProduct(
    body="moon", source_id="lola", asset="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF",
    period="NASA LOLA adjusted south polar DEM", resolution="20 m projected pixels, 80–90°S",
    datum="LOLA sphere (1737.4 km radius)", frame="Moon Mean Earth, DE421", meters_per_unit=1, latitude_range=(-90, -80),
)
OFFICIAL_DEMS = {"mars": MOLA, "moon": LOLA}


def grid_bounds(bounds: CellBounds, step: float, lon_step: float | None = None) -> Iterator[CellBounds]:
    lon_step = step if lon_step is None else lon_step
    if any(not isfinite(value) or value <= 0 for value in (step, lon_step)):
        raise ValueError("Cell size must be a finite positive number of degrees.")

    def size(span, step):
        ratio = span / step
        if ratio > 400:
            raise ValueError("Request at most 400 cells per regional extraction.")
        return round(ratio) if ratio >= 1 and isclose(ratio, round(ratio), abs_tol=1e-8, rel_tol=0) else ceil(ratio)

    rows, cols = size(bounds.north - bounds.south, step), size(bounds.east - bounds.west, lon_step)
    if rows * cols > 400:
        raise ValueError("Request at most 400 cells per regional extraction.")
    for row in range(rows):
        for col in range(cols):
            yield CellBounds(
                south=bounds.south + row * step, west=bounds.west + col * lon_step,
                north=min(bounds.north, bounds.south + (row + 1) * step),
                east=min(bounds.east, bounds.west + (col + 1) * lon_step),
            )


def sample_grid(ds, project, longitudes, latitudes):
    x, y = project.transform(longitudes, latitudes)
    inverse = ~ds.transform
    col_f = inverse.a * x + inverse.b * y + inverse.c
    row_f = inverse.d * x + inverse.e * y + inverse.f
    inside = ((col_f >= 0) & (row_f >= 0) & (col_f < ds.width) & (row_f < ds.height))
    sample = np.full(longitudes.shape, np.nan)
    if not np.any(inside):
        return sample, 0
    row = np.floor(row_f[inside]).astype(int)
    col = np.floor(col_f[inside]).astype(int)
    top, left = int(row.min()), int(col.min())
    height, width = int(row.max()) - top + 1, int(col.max()) - left + 1
    # Large geographic areas with high-resolution source rasters should use smaller cells.
    if height * width > 4_000_000:
        raise ValueError("Cell crosses too many native pixels. Reduce cell size or crop the regional source.")
    raw = ds.read(1, window=Window(left, top, width, height), masked=True)
    sample[inside] = raw[row - top, col - left].astype(float).filled(np.nan)
    unique = len(set(zip(row[np.isfinite(sample[inside])], col[np.isfinite(sample[inside])])))
    return sample * ds.scales[0] + ds.offsets[0], unique


def terrain_metrics(z, lon, lat, geod, center, unique):
    valid = np.isfinite(z)
    result = {}
    if np.count_nonzero(valid) < MIN_COVERAGE * z.size:
        return result, 0
    heights = z[valid]
    result[Feature.ELEVATION] = (float(np.mean(heights)), "Mean elevation of valid geographic samples")
    if unique < MIN_COVERAGE * z.size:
        return result, 0
    result[Feature.RELIEF] = (float(np.ptp(heights)), "Maximum minus minimum of valid sample elevations")

    azimuth, _, distance = geod.inv(np.full(heights.size, center.lon), np.full(heights.size, center.lat), lon[valid], lat[valid])
    angle = np.radians(azimuth)
    design = np.column_stack((np.ones(heights.size), distance * np.sin(angle), distance * np.cos(angle)))
    plane, _, rank, _ = np.linalg.lstsq(design, heights, rcond=None)
    if rank == 3:
        result[Feature.ROUGHNESS] = (float(np.sqrt(np.mean((heights - design @ plane) ** 2))),
                                     "RMS elevation residual from a least-squares plane in local east/north meters")

    _, _, dx = geod.inv(lon[1:-1, :-2], lat[1:-1, :-2], lon[1:-1, 2:], lat[1:-1, 2:])
    _, _, dy = geod.inv(lon[:-2, 1:-1], lat[:-2, 1:-1], lon[2:, 1:-1], lat[2:, 1:-1])
    mask = (valid[1:-1, 1:-1] & valid[1:-1, :-2] & valid[1:-1, 2:]
            & valid[:-2, 1:-1] & valid[2:, 1:-1] & (dx > 0) & (dy > 0))
    count = int(np.count_nonzero(mask))
    if count >= MIN_COVERAGE * mask.size:
        east_gradient = (z[1:-1, 2:][mask] - z[1:-1, :-2][mask]) / dx[mask]
        north_gradient = (z[2:, 1:-1][mask] - z[:-2, 1:-1][mask]) / dy[mask]
        slope = np.degrees(np.arctan(np.hypot(east_gradient, north_gradient)))
        result[Feature.SLOPE] = (float(np.percentile(slope, 90)), "P90 centered geographic-grid slope")
    return result, count


def build_cells(product: DemProduct, bounds: CellBounds, step: float, samples_per_axis: int,
                *, asset: str | None = None, lon_step: float | None = None) -> Iterator[PlanetaryCell]:
    if not 3 <= samples_per_axis <= 51 or product.meters_per_unit <= 0:
        raise ValueError("Use 3–51 samples per axis and a positive elevation conversion factor.")
    south, north = product.latitude_range
    if not -90 <= south < north <= 90:
        raise ValueError("Invalid DEM latitude coverage.")
    uri = asset or product.asset
    cells = list(grid_bounds(bounds, step, lon_step))
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="25",
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF"), rasterio.open(uri) as ds:
        if ds.count != 1 or ds.crs is None or ds.colorinterp[0].name == "palette":
            raise ValueError("Expected a georeferenced, single-band numerical elevation raster.")
        crs = CRS.from_user_input(ds.crs)
        geographic = crs.geodetic_crs
        if geographic is None:
            raise ValueError("The elevation raster needs a planetary geodetic CRS.")
        geod = geographic.get_geod()
        if abs(geod.a / BODY_RADII[product.body] - 1) > 0.005 or abs(geod.f) > 1e-8:
            raise ValueError("Expected the stated planetary body and a spherical planetocentric CRS.")
        project = Transformer.from_crs(geographic, crs, always_xy=True)
        for cell in cells:
            point = Point(lat=(cell.south + cell.north) / 2, lon=(cell.west + cell.east) / 2)
            fractions = (np.arange(samples_per_axis) + 0.5) / samples_per_axis
            lon, lat = np.meshgrid(cell.west + fractions * (cell.east - cell.west),
                                   cell.south + fractions * (cell.north - cell.south))
            sample_lon = lon % 360 if crs.is_geographic and ds.bounds.left >= 0 and ds.bounds.right > 180 else lon
            allowed = (lat >= south) & (lat <= north)
            z, unique = sample_grid(ds, project, sample_lon, np.where(allowed, lat, np.nan))
            z[~allowed] = np.nan
            z = z * product.meters_per_unit + product.offset_m
            metrics, valid_gradients = terrain_metrics(z, lon, lat, geod, point, unique)
            valid_elevations = int(np.count_nonzero(np.isfinite(z)))
            group = (f"{product.source_id}_cell_{cell.north-cell.south:.10g}x"
                     f"{cell.east-cell.west:.10g}deg_{samples_per_axis}samples")
            limitations = [f"Vertical datum: {product.datum}. Frame: {product.frame}.",
                           "Cell screening values depend on sample spacing, interpolation in the source DEM and latitude.",
                           f"{valid_elevations}/{z.size} finite samples and {unique} distinct source pixels."]
            measurements = [Measurement(
                feature=feature, value=round(value, 3), unit="deg" if feature == Feature.SLOPE else "m",
                point=point, source_id=product.source_id, period=product.period, resolution=product.resolution,
                statistic_group=group, value_origin="derived", method=method, limitations=limitations,
            ) for feature, (value, method) in metrics.items()]
            yield PlanetaryCell(body=product.body, point=point, bounds=cell, source_id=product.source_id,
                                asset=product.asset, samples_per_axis=samples_per_axis, valid_elevations=valid_elevations,
                                valid_gradients=valid_gradients, measurements=measurements,
                                missing=[feature for feature in CELL_FEATURES if feature not in metrics])


def load_product(path: Path) -> tuple[DemProduct, str]:
    product = DemProduct.model_validate_json(path.read_bytes())
    asset = product.asset
    if "://" not in asset:
        asset = str(path.parent / asset)
    elif not asset.startswith("https://"):
        raise ValueError("Remote elevation assets must use HTTPS.")
    return product, asset
