"""Thin wrapper around the OpenRouteService (ORS) geocoding + directions APIs."""

from __future__ import annotations

from dataclasses import dataclass

import requests
from django.conf import settings

ORS_BASE_URL = "https://api.openrouteservice.org"
METERS_PER_MILE = 1609.344
REQUEST_TIMEOUT_SECONDS = 15


class RoutingError(Exception):
    """Raised when geocoding or directions lookup fails."""


@dataclass
class GeocodedPlace:
    lat: float
    lon: float
    label: str


@dataclass
class RouteResult:
    distance_miles: float
    duration_hours: float
    # Polyline as a list of (lat, lon) points, in travel order.
    geometry: list[tuple[float, float]]


def _api_key() -> str:
    key = settings.ORS_API_KEY
    if not key:
        raise RoutingError(
            "ORS_API_KEY is not configured. Set it in the backend .env file."
        )
    return key


def geocode(query: str) -> GeocodedPlace:
    """Turn a free-text location (e.g. 'Chicago, IL') into coordinates."""
    if not query or not query.strip():
        raise RoutingError("Location text must not be empty.")

    resp = requests.get(
        f"{ORS_BASE_URL}/geocode/search",
        params={"api_key": _api_key(), "text": query, "size": 1},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise RoutingError(f"Geocoding failed for '{query}': {resp.status_code} {resp.text[:200]}")

    features = resp.json().get("features", [])
    if not features:
        raise RoutingError(f"Could not find a location matching '{query}'.")

    feature = features[0]
    lon, lat = feature["geometry"]["coordinates"]
    label = feature.get("properties", {}).get("label", query)
    return GeocodedPlace(lat=lat, lon=lon, label=label)


def autocomplete(query: str, limit: int = 5) -> list[GeocodedPlace]:
    """Location suggestions for as-you-type search boxes."""
    if not query or not query.strip():
        return []

    resp = requests.get(
        f"{ORS_BASE_URL}/geocode/autocomplete",
        params={"api_key": _api_key(), "text": query, "size": limit},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        return []

    places = []
    for feature in resp.json().get("features", []):
        lon, lat = feature["geometry"]["coordinates"]
        label = feature.get("properties", {}).get("label", query)
        places.append(GeocodedPlace(lat=lat, lon=lon, label=label))
    return places


def reverse_geocode(lat: float, lon: float) -> str:
    """Best-effort place label for a coordinate (used to label ELD stops)."""
    try:
        resp = requests.get(
            f"{ORS_BASE_URL}/geocode/reverse",
            params={"api_key": _api_key(), "point.lon": lon, "point.lat": lat, "size": 1},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            return f"{lat:.3f}, {lon:.3f}"
        features = resp.json().get("features", [])
        if not features:
            return f"{lat:.3f}, {lon:.3f}"
        return features[0].get("properties", {}).get("label", f"{lat:.3f}, {lon:.3f}")
    except requests.RequestException:
        return f"{lat:.3f}, {lon:.3f}"


def get_route(start: GeocodedPlace, end: GeocodedPlace) -> RouteResult:
    """Fetch a driving route (heavy-goods-vehicle profile) between two points."""
    resp = requests.post(
        f"{ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
        headers={"Authorization": _api_key(), "Content-Type": "application/json"},
        json={"coordinates": [[start.lon, start.lat], [end.lon, end.lat]]},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise RoutingError(
            f"Routing failed from '{start.label}' to '{end.label}': "
            f"{resp.status_code} {resp.text[:200]}"
        )

    data = resp.json()
    features = data.get("features", [])
    if not features:
        raise RoutingError(f"No route found from '{start.label}' to '{end.label}'.")

    feature = features[0]
    summary = feature["properties"]["summary"]
    coords = feature["geometry"]["coordinates"]  # [lon, lat] pairs

    return RouteResult(
        distance_miles=summary["distance"] / METERS_PER_MILE,
        duration_hours=summary["duration"] / 3600.0,
        geometry=[(lat, lon) for lon, lat in coords],
    )
