"""Small geometry helpers for working with route polylines."""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.8


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = sin(dlat / 2) ** 2 + cos(lat1r) * cos(lat2r) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(a))


def interpolate_along_path(coords: list[tuple[float, float]], fraction: float) -> tuple[float, float]:
    """
    Given a polyline as a list of (lat, lon) points, return the (lat, lon)
    that lies `fraction` (0..1) of the way along its total length.
    """
    if not coords:
        raise ValueError("coords must be non-empty")
    if len(coords) == 1 or fraction <= 0:
        return coords[0]
    if fraction >= 1:
        return coords[-1]

    seg_lengths = [
        haversine_miles(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
        for i in range(len(coords) - 1)
    ]
    total = sum(seg_lengths)
    if total <= 0:
        return coords[-1]

    target = fraction * total
    covered = 0.0
    for i, seg_len in enumerate(seg_lengths):
        if covered + seg_len >= target or i == len(seg_lengths) - 1:
            remaining = target - covered
            seg_fraction = remaining / seg_len if seg_len > 0 else 0.0
            lat1, lon1 = coords[i]
            lat2, lon2 = coords[i + 1]
            return (lat1 + (lat2 - lat1) * seg_fraction, lon1 + (lon2 - lon1) * seg_fraction)
        covered += seg_len

    return coords[-1]
