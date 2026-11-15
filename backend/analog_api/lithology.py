"""Read the spatially coarse, published GLiM v1.0 categorical grid."""
import csv
from functools import lru_cache
from math import floor
from pathlib import Path
from zipfile import ZipFile

from .models import Feature, Measurement, Point

GLIM = Path(__file__).resolve().parents[1] / "data" / "glim-2012-0.5deg.zip"


@lru_cache(maxsize=1)
def read_grid():
    with ZipFile(GLIM) as archive:
        raw = archive.read("glim_wgs84_0point5deg.txt.asc").decode("ascii").splitlines()
        legend = csv.DictReader(archive.read("Classnames.txt").decode("ascii").splitlines(), delimiter=";")
        codes = {int(row["Value_"]): row["xx"].lower() for row in legend}
    header = {key.lower(): float(value) for key, value in (line.split() for line in raw[:6])}
    if header != {"ncols": 720, "nrows": 360, "xllcorner": -180, "yllcorner": -90, "cellsize": 0.5, "nodata_value": -9999}:
        raise ValueError("Unexpected GLiM grid geometry.")
    rows = tuple(tuple(codes.get(int(value)) for value in row.split()) for row in raw[6:])
    if len(rows) != 360 or any(len(row) != 720 for row in rows):
        raise ValueError("Incomplete GLiM grid.")
    return rows


def mapped_lithology(point: Point) -> Measurement | None:
    longitude = -180 if point.lon == 180 else point.lon
    col = floor((longitude + 180) * 2)
    row = 359 - min(359, floor((point.lat + 90) * 2))
    code = read_grid()[row][col]
    if code in {None, "nd", "wb", "ig"}:
        return None
    return Measurement(
        feature=Feature.LITHOLOGY, value=code, unit="class", source_id="glim", point=point, period="GLiM v1.0 (2012)",
        resolution="0.5° geographic grid", method="Published dominant land lithology class at the point's grid cell",
        statistic_group="glim_v1_0.5deg", value_origin="derived",
        limitations=["Broad regional class. A 0.5° map cell cannot confirm a local outcrop or mineral composition."],
    )
