"""Build a bounded offline Earth search grid from public provider data."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from tempfile import NamedTemporaryFile
from math import floor
from pathlib import Path
from time import sleep

import httpx
import numpy as np
import rasterio
from pyproj import Geod
from pydantic import TypeAdapter
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError

from .catalog import DATA, load_catalog, validate_measurements
from .earth import POWER_URL, parse_power
from .geospatial import srtm_window, worldcover_uri
from .lithology import mapped_lithology
from .models import CellBounds, Feature as F, Measurement, Point
from .planetary_grid import grid_bounds
from .spatial_models import SearchCell, SearchGrid, SearchRegion

WGS84 = Geod(ellps="WGS84")
PARAMETERS = ("T2M", "PRECTOTCORR", "WS10M")
LAND_COVER_CLASSES = (10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100)


def center(bounds):
    return Point(lat=(bounds.south + bounds.north) / 2, lon=(bounds.west + bounds.east) / 2)


def layout(region):
    for i, bounds in enumerate(grid_bounds(region.bounds, 1), start=1):
        parent_id = f"{region.id}/{i}"
        yield parent_id, None, bounds
        for j, child in enumerate(grid_bounds(bounds, 0.25), start=1):
            yield f"{parent_id}/{j}", parent_id, child


def write_atomic(path, content):
    with NamedTemporaryFile(dir=path.parent, delete=False, mode="w", encoding="utf-8") as stream:
        temporary = Path(stream.name)
        stream.write(content)
    temporary.replace(path)


def cache_json(path, build):
    if not path.is_file():
        data = build()
        write_atomic(path, json.dumps(data, separators=(",", ":")))
        return data
    return json.loads(path.read_text())


def power_index(client, region, cache):
    b = region.bounds
    output = {}
    periods = set()
    for parameter in PARAMETERS:
        params = {
            "parameters": parameter, "community": "AG", "format": "JSON",
            "latitude-min": b.south - 0.5, "latitude-max": b.north + 0.5,
            "longitude-min": b.west - 0.625, "longitude-max": b.east + 0.625,
        }

        def fetch():
            response = client.get(POWER_URL.replace("/point", "/regional"), params=params)
            response.raise_for_status()
            return response.json()

        data = cache_json(cache / f"power-{region.id}-{b.south}-{b.west}-{b.north}-{b.east}-{parameter}.json", fetch)
        header = data["header"]
        period = f"{header['start'][:4]}–{header['end'][:4]}"
        if header["start"][4:] != "0101" or header["end"][4:] != "1231" or "MERRA2" not in header["sources"]:
            raise ValueError("Unexpected POWER climatology metadata.")
        periods.add(period)
        if len(periods) > 1:
            raise ValueError(f"POWER climatology periods differ in {region.id}. Prepare it with a consistent cache.")
        index = {}
        for row in data["features"]:
            lon, lat, *_ = row["geometry"]["coordinates"]
            if lat % 0.5 or lon % 0.625:
                raise ValueError("Unexpected POWER regional grid spacing or alignment.")
            for m in parse_power(row | {"header": header, "parameters": data["parameters"]}, Point(lat=lat, lon=lon)):
                index.setdefault((lat, lon), []).append(m.model_copy(update={
                    "period": period, "statistic_group": f"power_regional_{period.replace('–', '_')}",
                    "method": f"{m.method}. Nearest POWER regional grid coordinate ({lat:g}, {lon:g}).",
                }))
        output[parameter] = index
    return output


def climate_at(point, index):
    # The native grid is rectangular and aligned to 0.5° latitude and 0.625° longitude.
    lat = floor(point.lat / 0.5 + 0.5) * 0.5
    lon = floor(point.lon / 0.625 + 0.5) * 0.625
    return [m.model_copy(update={"point": point}) for data in index.values() for m in data.get((lat, lon), [])]


def dem_uri(point):
    lat, lon = floor(point.lat), floor(point.lon)
    tile = f"{'N' if lat >= 0 else 'S'}{abs(lat):02}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03}_00"
    name = f"Copernicus_DSM_COG_30_{tile}_DEM"
    return f"https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif"


def raster_tile(uri, factor, cache):
    path = cache / f"{Path(uri).stem}-overview-{factor}.npz"
    if path.is_file():
        with np.load(path, allow_pickle=False) as data:
            return data["array"], data["bounds"].tolist()
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="30",
                          GDAL_HTTP_MAX_RETRY="2", VSI_CACHE="TRUE"), rasterio.open(uri) as ds:
            if ds.count != 1 or ds.crs is None or ds.crs.to_epsg() != 4326:
                raise ValueError("Unexpected raster structure or CRS.")
            if factor != 1 and factor not in ds.overviews(1):
                raise ValueError(f"Expected native overview factor {factor}: {uri}")
            height = (ds.height + factor - 1) // factor
            width = (ds.width + factor - 1) // factor
            array = ds.read(1, out_shape=(height, width), resampling=Resampling.nearest,
                            masked=True).astype("float32").filled(np.nan)
            bounds = list(ds.bounds)
    except RasterioIOError as exc:
        if "404" in str(exc):
            return None
        raise
    with NamedTemporaryFile(dir=path.parent, delete=False, suffix=".npz") as stream:
        temp = Path(stream.name)
        np.savez_compressed(stream, array=array, bounds=bounds)
    temp.replace(path)
    return array, bounds


def sample_mosaic(tiles, bounds, n):
    latitudes = bounds.south + (np.arange(n) + 0.5) * (bounds.north - bounds.south) / n
    longitudes = bounds.west + (np.arange(n) + 0.5) * (bounds.east - bounds.west) / n
    lon, lat = np.meshgrid(longitudes, latitudes)
    data = np.full(lon.shape, np.nan)
    pixel_ids = np.full(lon.shape, -1, dtype=np.int64)
    offset = 0
    for array, (west, south, east, north) in tiles:
        inside = (lon >= west) & (lon < east) & (lat >= south) & (lat < north)
        j = np.floor((lon[inside] - west) / (east - west) * array.shape[1]).astype(int)
        i = np.minimum(array.shape[0] - 1, np.floor((north - lat[inside]) / (north - south) * array.shape[0]).astype(int))
        data[inside] = array[i, j]
        pixel_ids[inside] = offset + i * array.shape[1] + j
        offset += array.size
    return data, lon, lat, np.unique(pixel_ids[np.isfinite(data)]).size


def derived(feature, value, unit, point, source, method, resolution, group, limitations, period):
    return Measurement(feature=feature, value=round(float(value), 3), unit=unit, point=point, source_id=source,
                       method=method, resolution=resolution, statistic_group=group, limitations=limitations,
                       period=period, value_origin="derived")


def terrain_rows(bounds, point, tiles, fine):
    n = 15 if fine else 23
    z, lon, lat, _ = sample_mosaic(tiles, bounds, n)
    finite = np.isfinite(z)
    if np.mean(finite) < 0.8:
        return []
    kwargs = dict(point=point, source="copernicus_glo90", resolution=f"GLO-90 2× overview, {n}×{n} samples per search cell",
                  group=f"glo90_search_{'fine' if fine else 'coarse'}", period="Copernicus GLO-90 public 2021 release",
                  limitations=["Digital surface model. Elevation references EGM2008. Slope is scale-dependent and is not a rover traverse measurement."])
    _, _, dx = WGS84.inv(lon[1:-1, :-2], lat[1:-1, :-2], lon[1:-1, 2:], lat[1:-1, 2:])
    _, _, dy = WGS84.inv(lon[:-2, 1:-1], lat[:-2, 1:-1], lon[2:, 1:-1], lat[2:, 1:-1])
    east = (z[1:-1, 2:] - z[1:-1, :-2]) / dx
    north = (z[2:, 1:-1] - z[:-2, 1:-1]) / dy
    slopes = np.degrees(np.arctan(np.hypot(east, north)))
    valid = np.isfinite(slopes) & finite[1:-1, 1:-1]
    rows = [derived(F.ELEVATION, np.mean(z[finite]), "m", method="Mean of finite terrain samples within the geographic cell", **kwargs)]
    if np.mean(valid) >= 0.8:
        rows.append(derived(F.SLOPE, np.percentile(slopes[valid], 90), "deg",
                            method="P90 central-difference slope over the search cell, using geodesic sample separations", **kwargs))
    return rows


def cover_rows(bounds, point, tiles, fine):
    z, _, _, _ = sample_mosaic(tiles, bounds, 25 if fine else 39)
    valid = np.isin(z, LAND_COVER_CLASSES)
    if np.mean(valid) < 0.8:
        return [], None
    water = float(np.mean(z[valid] == 80))
    kwargs = dict(point=point, source="worldcover", resolution="ESA WorldCover 10 m, native 32× overview sampled over search cell",
                  group=f"worldcover_search_{'fine' if fine else 'coarse'}", period="2021",
                  limitations=["Approximate fraction from sampled map classes. Water class does not establish accessibility, quality, or ice."])
    return [
        derived(F.BARE_COVER, 100 * np.mean(z[valid] == 60), "%", method="Sampled class 60 fraction", **kwargs),
        derived(F.SURFACE_WATER, 100 * water, "%", method="Sampled class 80 fraction", **kwargs),
    ], water


def region_tiles(region, cache, *, dem_factor=2):
    b = region.bounds
    dem = {dem_uri(Point(lat=i + 0.5, lon=j + 0.5)) for i in range(floor(b.south), int(np.ceil(b.north)))
           for j in range(floor(b.west), int(np.ceil(b.east)))}
    probe_lat = [b.south + 0.00001, b.north - 0.00001] + list(range(int(np.ceil(b.south)), int(np.ceil(b.north))))
    probe_lon = [b.west + 0.00001, b.east - 0.00001] + list(range(int(np.ceil(b.west)), int(np.ceil(b.east))))
    cover = {worldcover_uri(Point(lat=lat, lon=lon)) for lat in probe_lat for lon in probe_lon if lat >= -60}
    with ThreadPoolExecutor(max_workers=4) as pool:
        terrain_tiles = [tile for tile in pool.map(lambda uri: raster_tile(uri, dem_factor, cache), sorted(dem)) if tile is not None]
        cover_tiles = [tile for tile in pool.map(lambda uri: raster_tile(uri, 32, cache), sorted(cover)) if tile is not None]
    return terrain_tiles, cover_tiles


def prepare_region(client, region, cache):
    climate = power_index(client, region, cache)
    terrain_tiles, cover_tiles = region_tiles(region, cache)
    cells = []
    for id, parent, bounds in layout(region):
        point = center(bounds)
        lithology = mapped_lithology(point)
        terrain = terrain_rows(bounds, point, terrain_tiles, parent is not None)
        cover, water = cover_rows(bounds, point, cover_tiles, parent is not None)
        # Generic elevation at a coastline can also represent water; require one land indicator.
        eligible = water < 0.5 if water is not None else bool(lithology or region.id == "dry-valleys" and terrain)
        rows = [*climate_at(point, climate), *terrain, *cover]
        if lithology:
            rows.append(lithology)
        cells.append(SearchCell(id=id, region_id=region.id, parent_id=parent, bounds=bounds, point=point,
                                measurements=rows, land_eligible=eligible))
    return cells


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=DATA.parent / "local" / "search-cache")
    parser.add_argument("--regions", nargs="+")
    parser.add_argument("--srtm-baseline-region", help="Cache SRTM point windows for a separate coordinate-sampling benchmark.")
    parser.add_argument("--point-output", type=Path, help="Write the coordinate benchmark samples separately.")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    regions = TypeAdapter(list[SearchRegion]).validate_json((DATA / "search_regions.json").read_bytes())
    if args.regions:
        if set(args.regions) - {r.id for r in regions}:
            parser.error("Unknown search region.")
        regions = [r for r in regions if r.id in args.regions]
    if bool(args.srtm_baseline_region) != bool(args.point_output):
        parser.error("Point benchmarks require both --srtm-baseline-region and --point-output.")
    if args.srtm_baseline_region and args.srtm_baseline_region not in {r.id for r in regions}:
        parser.error("The SRTM baseline region must be selected for preprocessing.")
    catalog = load_catalog()
    cells = []
    point_samples = {}
    with httpx.Client(timeout=40, follow_redirects=True) as client:
        for region in regions:
            new = prepare_region(client, region, args.cache)
            for cell in new:
                if region.id == args.srtm_baseline_region and cell.parent_id and cell.land_eligible:
                    def fetch_point():
                        # The public OpenTopoData server limits tests to one request per second.
                        sleep(1.1)
                        return [m.model_dump(mode="json") for m in srtm_window(client, cell.point)]
                    raw = cache_json(args.cache / f"srtm-{cell.point.lat:.8f}-{cell.point.lon:.8f}.json", fetch_point)
                    samples = TypeAdapter(list[Measurement]).validate_python(raw)
                    validate_measurements(samples, cell.point, catalog.sources)
                    point_samples[cell.id] = raw
                validate_measurements(cell.measurements, cell.point, catalog.sources)
            print(region.id, len(new), dict(Counter(m.source_id for c in new for m in c.measurements)), flush=True)
            cells.extend(new)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_atomic(args.output, SearchGrid(regions=regions, cells=cells).model_dump_json() + "\n")
    if args.point_output:
        args.point_output.parent.mkdir(parents=True, exist_ok=True)
        write_atomic(args.point_output, json.dumps(point_samples, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
