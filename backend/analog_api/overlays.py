"""Serialize planetocentric raster-cell footprints for map overlays."""
from collections.abc import Callable
from typing import Literal

from .models import CellBounds, Model, Number, PlanetaryCell


class CellPolygon(Model):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[Number, Number]]]


class CellOverlay(Model):
    type: Literal["Feature"] = "Feature"
    geometry: CellPolygon
    properties: PlanetaryCell
    comparable_scale: bool


class CellOverlayCollection(Model):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CellOverlay]


def bounds_polygon(b: CellBounds) -> CellPolygon:
    ring = [(b.west, b.south), (b.east, b.south), (b.east, b.north), (b.west, b.north), (b.west, b.south)]
    return CellPolygon(coordinates=[ring])


def cell_overlays(cells: list[PlanetaryCell], comparable_scale: Callable[[PlanetaryCell], bool]) -> CellOverlayCollection:
    return CellOverlayCollection(features=[
        CellOverlay(geometry=bounds_polygon(cell.bounds), properties=cell, comparable_scale=comparable_scale(cell))
        for cell in cells
    ])
