import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from pydantic import TypeAdapter

from .models import Case, EvidenceSource, FeatureTable, Measurement, PlanetaryCell, Point, Site
from .science import FEATURES

DATA = Path(__file__).resolve().parents[1] / "data"


def same_point(a: Point, b: Point) -> bool:
    lon_delta = (a.lon - b.lon + 180) % 360 - 180
    return abs(a.lat - b.lat) < 1e-8 and abs(lon_delta) < 1e-8


@dataclass(frozen=True)
class Catalog:
    sources: dict[str, EvidenceSource]
    sites: dict[str, Site]
    cases: tuple[Case, ...]
    features: FeatureTable

    def source_list(self, ids: Iterable[str]) -> list[EvidenceSource]:
        return [self.sources[item] for item in sorted(set(ids))]

    def cases_at(self, site_id: str) -> list[Case]:
        return [case for case in self.cases if case.site_id == site_id]


def read_rows(path, model):
    return TypeAdapter(list[model]).validate_json(path.read_bytes())


def by_id(rows):
    indexed = {row.id: row for row in rows}
    if len(indexed) != len(rows):
        raise ValueError("Duplicate catalog ID.")
    return indexed


def validate_measurements(rows, point, sources):
    seen = set()
    for row in rows:
        spec = FEATURES[row.feature]
        if (row.feature, row.source_id) in seen or row.source_id not in sources or row.unit != spec.unit:
            raise ValueError(f"Invalid or duplicate measurement: {row.feature}/{row.source_id}")
        if not same_point(row.point, point):
            raise ValueError(f"Measurement point mismatch for {row.feature}.")
        if spec.unit == "class":
            if not isinstance(row.value, str):
                raise ValueError(f"Expected a mapped unit symbol for {row.feature}.")
        elif not isinstance(row.value, float) or not spec.minimum <= row.value <= spec.maximum:
            raise ValueError(f"Measurement outside numeric domain for {row.feature}.")
        seen.add((row.feature, row.source_id))


def cell_key(cell: PlanetaryCell):
    bounds = cell.bounds
    return (cell.body, cell.source_id, bounds.south, bounds.west, bounds.north, bounds.east, cell.samples_per_axis)


def contains_point(cell: PlanetaryCell, point: Point) -> bool:
    bounds = cell.bounds
    longitude = -180 if point.lon == 180 else point.lon
    return (bounds.west <= longitude < bounds.east
            and (bounds.south <= point.lat < bounds.north or point.lat == bounds.north == 90))


def load_catalog(data_dir: Path = DATA, overlay: Path | None = None) -> Catalog:
    sources = by_id(read_rows(data_dir / "sources.json", EvidenceSource))
    sites = by_id(read_rows(data_dir / "sites.json", Site))
    cases = tuple(by_id(read_rows(data_dir / "cases.json", Case)).values())
    tables = [FeatureTable.model_validate_json((data_dir / "features.json").read_bytes())]
    if overlay is not None:
        tables.append(FeatureTable.model_validate_json(overlay.read_bytes()))

    for site in sites.values():
        for source_id in [*site.source_ids, *(obs.source_id for obs in site.observations)]:
            if source_id not in sources:
                raise ValueError(f"Unknown source {source_id} at {site.id}.")
    for case in cases:
        if case.site_id not in sites or case.source_id not in sources:
            raise ValueError(f"Invalid reference in {case.id}.")

    use_cases = {}
    for case in cases:
        group = sites[case.site_id].site_group
        key = (group, case.purpose_id) if case.purpose_id else (case.site_id, case.source_id)
        use_cases.setdefault(key, case)
    cases = tuple(use_cases.values())

    features = FeatureTable()
    for table in tables:
        for site_id, measurements in table.earth.items():
            validate_measurements(measurements, sites[site_id].point, sources)
            indexed = {(row.feature, row.source_id): row for row in features.earth.get(site_id, [])}
            indexed.update({(row.feature, row.source_id): row for row in measurements})
            features.earth[site_id] = list(indexed.values())
        for row in table.planetary:
            validate_measurements(row.measurements, row.point, sources)
            prior = next((item for item in features.planetary if item.body == row.body and same_point(item.point, row.point)), None)
            if prior is None:
                features.planetary.append(row)
                continue
            indexed = {(m.feature, m.source_id): m for m in prior.measurements}
            indexed.update({(m.feature, m.source_id): m for m in row.measurements})
            prior.measurements = list(indexed.values())
    cells = {}
    for table in tables:
        for cell in table.planetary_cells:
            validate_measurements(cell.measurements, cell.point, sources)
            if cell.source_id not in sources or any(m.source_id != cell.source_id for m in cell.measurements):
                raise ValueError("Invalid planetary cell source.")
            cells[cell_key(cell)] = cell
    features.planetary_cells = list(cells.values())
    return Catalog(sources, sites, cases, features)


def write_table(path: Path, table: FeatureTable) -> None:
    from tempfile import NamedTemporaryFile

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with NamedTemporaryFile(dir=path.parent, delete=False, mode="w", encoding="utf-8") as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(json.dumps(table.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n")
        temporary_path.replace(path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
