"""Build small, reproducible feature tables from regional products."""
import argparse
import sys
import time
from pathlib import Path

import httpx

from .catalog import cell_key, load_catalog, same_point, validate_measurements, write_table
from .earth import read_power
from .lithology import mapped_lithology
from .geospatial import (MOLA_TIFF, build_planetary_row, copernicus_window, official_geologic_unit,
                         read_era5_csv, read_worldcover, srtm_window)
from .models import CellBounds, FeatureTable, Point
from .planetary_grid import OFFICIAL_DEMS, build_cells, load_product

LOLA_TIFF = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    commands = parser.add_subparsers(dest="command", required=True)
    earth = commands.add_parser("earth")
    earth.add_argument("--sites", nargs="+")
    earth.add_argument("--products", nargs="+", choices=("power", "srtm", "worldcover", "copernicus-dem", "glim"), default=["power", "srtm"])
    planet = commands.add_parser("planet")
    planet.add_argument("body", choices=("mars", "moon"))
    planet.add_argument("lat", type=float)
    planet.add_argument("lon", type=float)
    dem = planet.add_mutually_exclusive_group()
    dem.add_argument("--dem", help="Local crop of the catalog's published single-band DEM.")
    dem.add_argument("--official-dem", action="store_true", help="Try the published URL using GDAL byte ranges.")
    geology = planet.add_mutually_exclusive_group()
    geology.add_argument("--geology", type=Path)
    geology.add_argument("--official-geology", action="store_true")
    planet.add_argument("--unit-field", default="UNIT")
    cells = commands.add_parser("cells", help="Create regional geographic terrain cells from a planetary DEM.")
    product = cells.add_mutually_exclusive_group(required=True)
    product.add_argument("--official", choices=tuple(OFFICIAL_DEMS))
    product.add_argument("--manifest", type=Path)
    cells.add_argument("--bounds", nargs=4, type=float, required=True, metavar=("SOUTH", "WEST", "NORTH", "EAST"))
    cells.add_argument("--step", type=float, required=True)
    cells.add_argument("--lon-step", type=float, help="Longitude cell size in degrees. Defaults to --step.")
    cells.add_argument("--samples", type=int, default=7)
    era = commands.add_parser("era5")
    era.add_argument("site")
    era.add_argument("csv", type=Path)
    era.add_argument("grid_lat", type=float)
    era.add_argument("grid_lon", type=float)
    args = parser.parse_args()
    output = args.output
    catalog = load_catalog()
    table = FeatureTable.model_validate_json(output.read_bytes()) if output.exists() else FeatureTable()

    def update_earth(site_id, rows):
        site = catalog.sites[site_id]
        validate_measurements(rows, site.point, catalog.sources)
        indexed = {(m.feature, m.source_id): m for m in table.earth.get(site_id, [])}
        indexed.update({(m.feature, m.source_id): m for m in rows})
        table.earth[site_id] = list(indexed.values())

    errors = []
    if args.command == "earth":
        from rasterio.errors import RasterioError

        sites = list(dict.fromkeys(args.sites or catalog.sites))
        if unknown := [site for site in sites if site not in catalog.sites]:
            parser.error("Unknown sites: " + ", ".join(unknown))
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            products = {"power": lambda p: read_power(client, p), "srtm": lambda p: srtm_window(client, p),
                        "worldcover": read_worldcover, "copernicus-dem": copernicus_window,
                        "glim": lambda p: [m] if (m := mapped_lithology(p)) else []}
            last_srtm = float("-inf")
            for site_id in sites:
                for product in dict.fromkeys(args.products):
                    if product == "srtm":
                        # Respect the public test service's one request per second limit.
                        pause = 1.1 - (time.monotonic() - last_srtm)
                        if pause > 0:
                            time.sleep(pause)
                        last_srtm = time.monotonic()
                    try:
                        rows = products[product](catalog.sites[site_id].point)
                        if rows:
                            update_earth(site_id, rows)
                        print(f"{site_id} {product}: {len(rows)} measurement(s)")
                    except (httpx.HTTPError, RasterioError, OSError, ValueError, TypeError, KeyError) as exc:
                        errors.append(f"{site_id} {product}: {exc}")
    elif args.command == "cells":
        spec, asset = load_product(args.manifest) if args.manifest else (OFFICIAL_DEMS[args.official], None)
        if spec.source_id not in catalog.sources:
            parser.error("Register the DEM product source in backend/data/sources.json first.")
        bounds = CellBounds(**dict(zip(("south", "west", "north", "east"), args.bounds, strict=True)))
        incoming = list(build_cells(spec, bounds, args.step, args.samples, asset=asset, lon_step=args.lon_step))
        indexed = {cell_key(cell): cell for cell in table.planetary_cells}
        for cell in incoming:
            validate_measurements(cell.measurements, cell.point, catalog.sources)
            indexed[cell_key(cell)] = cell
        table.planetary_cells = list(indexed.values())
    elif args.command == "era5":
        if args.site not in catalog.sites:
            parser.error("Unknown site.")
        point = catalog.sites[args.site].point
        update_earth(args.site, read_era5_csv(args.csv, point, Point(lat=args.grid_lat, lon=args.grid_lon)))
    else:
        if not (args.dem or args.official_dem or args.geology or args.official_geology):
            parser.error("Provide a DEM or geology source.")
        point = Point(lat=args.lat, lon=args.lon)
        uri = {"mars": MOLA_TIFF, "moon": LOLA_TIFF}[args.body] if args.official_dem else args.dem
        if args.body == "moon" and uri and point.lat > -80:
            parser.error("The configured LOLA product covers 80–90°S.")
        row = build_planetary_row(args.body, point, uri, args.geology, args.unit_field)
        if args.official_geology:
            with httpx.Client(timeout=30) as client:
                row.measurements.extend(official_geologic_unit(client, point, args.body))
        validate_measurements(row.measurements, row.point, catalog.sources)
        if not row.measurements:
            parser.error("No usable measurements at the requested point.")
        prior = next((r for r in table.planetary if r.body == row.body and same_point(r.point, row.point)), None)
        if prior is None:
            table.planetary.append(row)
        else:
            indexed = {(m.feature, m.source_id): m for m in prior.measurements}
            indexed.update({(m.feature, m.source_id): m for m in row.measurements})
            prior.measurements = list(indexed.values())

    write_table(output, table)
    print(f"Wrote {output} ({sum(map(len, table.earth.values()))} Earth measurements, {len(table.planetary)} planetary rows, {len(table.planetary_cells)} planetary cells)")
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
