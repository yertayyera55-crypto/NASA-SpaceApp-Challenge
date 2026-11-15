from math import isfinite

import httpx

from .models import Feature as F, Measurement, Point

POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
SRTM_URL = "https://api.opentopodata.org/v1/srtm30m"
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()


def read_power(client: httpx.Client, point: Point) -> list[Measurement]:
    response = client.get(POWER_URL, params={
        "parameters": "T2M,PRECTOTCORR,WS10M", "community": "AG", "latitude": point.lat,
        "longitude": point.lon, "format": "JSON", "start": 2001, "end": 2020,
    })
    response.raise_for_status()
    data = response.json()
    lon, lat, *_ = data["geometry"]["coordinates"]
    if abs(point.lat - lat) > 0.00051 or abs((point.lon - lon + 180) % 360 - 180) > 0.00051:
        raise ValueError("NASA POWER response point mismatch.")
    if "2001" not in data["header"]["range"] or "2020" not in data["header"]["range"]:
        raise ValueError("Unexpected NASA POWER climatology period.")
    return parse_power(data, point)


def parse_power(data, point: Point) -> list[Measurement]:
    values = data["properties"]["parameter"]
    fill = data["header"]["fill_value"]

    def number(key, month, units):
        if data.get("parameters", {}).get(key, {}).get("units") not in units:
            return None
        value = values.get(key, {}).get(month)
        return value if type(value) in (int, float) and value != fill and isfinite(value) else None

    t2m = number("T2M", "ANN", {"C"})
    precip = number("PRECTOTCORR", "ANN", {"mm/day"})
    wind = number("WS10M", "ANN", {"m/s", "m s-1"})
    monthly = [number("T2M", month, {"C"}) for month in MONTHS]
    candidates = (
        (F.AIR_MEAN, t2m, "degC", "Annual T2M average"),
        (F.AIR_COLDEST_MONTH, min(monthly) if all(v is not None for v in monthly) else None,
         "degC", "Minimum of 12 climatological monthly T2M means"),
        (F.PRECIPITATION, precip, "mm/day", "Annual mean PRECTOTCORR daily rate"),
        (F.WIND, wind, "m/s", "Annual mean WS10M"),
    )
    return [
        Measurement(feature=feature, value=value, unit=unit, source_id="power", period="2001–2020", point=point,
                    resolution="MERRA-2 model grid (~0.5° latitude × 0.625° longitude)",
                    method=method, value_origin="derived" if feature == F.AIR_COLDEST_MONTH else "estimated", statistic_group="power_climatology_2001_2020",
                    limitations=["Grid-cell climatology averages over local relief and short-lived events."])
        for feature, value, unit, method in candidates if value is not None
    ]
