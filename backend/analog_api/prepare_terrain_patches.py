"""Prepare local Copernicus terrain profiles for planetary comparison."""
import argparse
from collections import defaultdict
from pathlib import Path

from pydantic import TypeAdapter

from .catalog import DATA, load_catalog
from .models import CellBounds
from .planetary_analogs import EARTH_PATCHES, EarthTerrainPatch, SCALES, TERRAIN_FEATURES
from .planetary_grid import terrain_metrics
from .prepare_search import WGS84, cover_rows, region_tiles, sample_mosaic, write_atomic
from .spatial import SEARCH_GRID, contains, load_search_grid


def earth_patch_bounds(point, scale):
    south = WGS84.fwd(point.lon, point.lat, 180, scale.north_south_m / 2)[1]
    north = WGS84.fwd(point.lon, point.lat, 0, scale.north_south_m / 2)[1]
    west = WGS84.fwd(point.lon, point.lat, -90, scale.east_west_m / 2)[0]
    east = WGS84.fwd(point.lon, point.lat, 90, scale.east_west_m / 2)[0]
    if west >= east or not south < point.lat < north:
        return None
    return CellBounds(south=south, west=west, north=north, east=east)


def prepare(grid, cache):
    output = {scale_id: [] for scale_id in SCALES}
    centers = defaultdict(list)
    for cell in grid.cells:
        if cell.parent_id and cell.land_eligible:
            centers[cell.region_id].append(cell)
    for region in grid.regions:
        dem, cover = region_tiles(region, cache, dem_factor=1)
        before = {scale_id: len(patches) for scale_id, patches in output.items()}
        for cell in centers[region.id]:
            for scale_id, scale in SCALES.items():
                bounds = earth_patch_bounds(cell.point, scale)
                if bounds is None or not contains(region.bounds, bounds):
                    continue
                _, water = cover_rows(bounds, cell.point, cover, True)
                if (water is None and region.id != "dry-valleys") or (water is not None and water >= 0.5):
                    continue
                values, lon, lat, unique = sample_mosaic(dem, bounds, scale.samples_per_axis)
                metrics, _ = terrain_metrics(values, lon, lat, WGS84, cell.point, unique)
                measured = {f: round(value, 3) for f, (value, _) in metrics.items() if f in TERRAIN_FEATURES}
                if measured:
                    output[scale_id].append(EarthTerrainPatch(cell_id=cell.id, point=cell.point, bounds=bounds, values=measured))
        print(region.id, {scale_id: len(patches) - before[scale_id] for scale_id, patches in output.items()}, flush=True)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grid", type=Path, default=SEARCH_GRID)
    parser.add_argument("--cache", type=Path, default=DATA.parent / "local" / "search-cache")
    parser.add_argument("--output", type=Path, default=EARTH_PATCHES)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    grid = load_search_grid(load_catalog(), args.grid)
    rows = prepare(grid, args.cache)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = TypeAdapter(dict[str, list[EarthTerrainPatch]]).dump_json(rows).decode()
    write_atomic(args.output, payload + "\n")


if __name__ == "__main__":
    main()
