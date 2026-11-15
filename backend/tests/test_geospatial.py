from datetime import UTC, datetime, timedelta
import json
from math import atan, degrees

import httpx
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from backend.analog_api.earth import MONTHS, read_power
from backend.analog_api.geospatial import (
    dem_measurements, official_geologic_unit, read_dem, read_era5_csv, read_geologic_unit,
    read_worldcover, worldcover_uri,
)
from backend.analog_api.models import Feature, Point


def test_power_checks_units_period_and_rounded_coordinates():
    raw = {
        "geometry": {"coordinates": [-16.767, 64.913, 801.56]},
        "header": {"range": "January 2001 - December 2020", "fill_value": -999},
        "parameters": {"T2M": {"units": "C"}, "PRECTOTCORR": {"units": "mm/day"},
                       "WS10M": {"units": "km/h"}},
        "properties": {"parameter": {
            "T2M": {**dict.fromkeys(MONTHS, -1), "ANN": -2.84, "FEB": -7.02},
            "PRECTOTCORR": {"ANN": -999}, "WS10M": {"ANN": 10},
        }},
    }
    point = Point(lat=64.91335, lon=-16.76735)
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=raw))) as client:
        result = {m.feature: m.value for m in read_power(client, point)}
        assert result == {Feature.AIR_MEAN: -2.84, Feature.AIR_COLDEST_MONTH: -7.02}
        raw["geometry"]["coordinates"][0] = -16.76
        with pytest.raises(ValueError, match="point mismatch"):
            read_power(client, point)


def test_slope_from_plane_and_nodata():
    grid = np.broadcast_to(np.arange(9) * 10., (9, 9)).copy()
    point = Point(lat=0, lon=0)
    metadata = (point, 20, 20, "srtm", "test", "test resolution", "test", "test limitation")
    rows = dem_measurements(metadata[0], grid, *metadata[1:])
    assert rows[0].value == 40
    assert rows[1].value == pytest.approx(degrees(atan(0.5)), abs=0.001)
    grid[:, :5] = np.nan
    assert not dem_measurements(metadata[0], grid, *metadata[1:])


def write_tiff(path, grid, *, bounds=(-2, 2, 0.01, 0.01), crs="EPSG:4326", nodata=None):
    h, w = grid.shape
    with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=1, dtype=grid.dtype,
                       crs=crs, transform=from_origin(*bounds), nodata=nodata) as out:
        out.write(grid, 1)


def test_raster_window_and_body_guard(tmp_path):
    path = tmp_path / "height.tif"
    write_tiff(path, np.broadcast_to(np.arange(20, dtype="int16"), (20, 20)))
    point = Point(lat=1.905, lon=-1.895)
    args = (str(path), point, "srtm", "test period", "test resolution", "test group", "test limitation")
    values = read_dem(*args)
    assert values[0].value == 10
    assert values[1].value > 0
    with pytest.raises(ValueError, match="inconsistent"):
        read_dem(*args, expected_body="moon")
    assert read_dem(str(path), Point(lat=0, lon=0), *args[2:]) == []


def test_worldcover_masks_nodata_and_counts_classes(tmp_path):
    grid = np.full((61, 61), 60, dtype="uint8")
    grid[:, 30] = 0
    grid[:, 31:] = 40
    path = tmp_path / "landcover.tif"
    write_tiff(path, grid, nodata=0)
    point = Point(lat=1.695, lon=-1.695)
    result = read_worldcover(point, str(path))
    assert result[0].value == 50
    assert worldcover_uri(Point(lat=-24.1, lon=-69.8)).endswith("_S27W072_Map.tif")
    grid[:, :30] = 0
    write_tiff(path, grid, nodata=0)
    assert read_worldcover(point, str(path)) == []


def test_era5_csv_units_and_time_axis(tmp_path):
    path = tmp_path / "era5.csv"
    start = datetime(2024, 1, 1, tzinfo=UTC)
    observations = [
        f"{(start + timedelta(hours=i)).isoformat()},{253.15 + i}" for i in range(24)
    ]
    path.write_text("valid_time,t2m\n" + "\n".join(observations))
    result = read_era5_csv(path, Point(lat=45, lon=60), Point(lat=45, lon=60.1))
    assert result[0].value == -20
    assert result[0].feature == Feature.AIR_HOURLY_MIN and result[0].source_id == "era5"
    path.write_text("time,2m_temperature\n" + "\n".join(observations[:5] + observations[6:]))
    with pytest.raises(ValueError, match="consecutive"):
        read_era5_csv(path, Point(lat=45, lon=60), Point(lat=45, lon=60))


def test_local_polygon_intersection_and_ambiguous_boundary(tmp_path):
    point = Point(lat=0, lon=0)
    polygon = {"type": "Polygon", "coordinates": [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]}
    item = {"type": "Feature", "properties": {"Unit": "abc"}, "geometry": polygon}
    data = {"type": "FeatureCollection", "features": [item]}
    path = tmp_path / "units.geojson"
    path.write_text(json.dumps(data))
    assert read_geologic_unit(path, point, "mars", "Unit")[0].value == "abc"
    data["features"].append({**item, "properties": {"Unit": "def"}})
    path.write_text(json.dumps(data))
    assert read_geologic_unit(path, point, "mars", "Unit") == []


def test_usgs_query_uses_native_coordinates():
    def answer(request):
        assert request.url.params["outFields"] == "FIRST_UnitSymbol"
        lon, lat = map(float, request.url.params["geometry"].split(","))
        assert lon == pytest.approx(30323.35, abs=0.01)
        assert lat == pytest.approx(0, abs=1e-6)
        return httpx.Response(200, json={"features": [{"attributes": {"FIRST_UnitSymbol": "Im2"}}]})
    with httpx.Client(transport=httpx.MockTransport(answer)) as client:
        result = official_geologic_unit(client, Point(lat=0, lon=1), "moon")
        assert result[0].value == "Im2"
