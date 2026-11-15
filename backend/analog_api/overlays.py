"""Serialize planetocentric raster-cell footprints for map overlays."""
from typing import Literal

from .models import CellBounds, Model, Number, PlanetaryCell


class CellPolygon(Model):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[Number, Number]]]


class CellOverlay(Model):
    type: Literal["Feature"] = "Feature"
    geometry: CellPolygon
    properties: PlanetaryCell


class CellOverlayCollection(Model):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CellOverlay]


def bounds_polygon(b: CellBounds) -> CellPolygon:
    ring = [(b.west, b.south), (b.east, b.south), (b.east, b.north), (b.west, b.north), (b.west, b.south)]
    return CellPolygon(coordinates=[ring])


def cell_overlays(cells: list[PlanetaryCell]) -> CellOverlayCollection:
    features = []
    for cell in cells:
        features.append(CellOverlay(geometry=bounds_polygon(cell.bounds), properties=cell))
    return CellOverlayCollection(features=features)
