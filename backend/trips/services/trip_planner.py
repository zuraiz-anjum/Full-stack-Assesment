"""
Orchestrates a full trip plan: geocode the three input locations, fetch
driving routes for each leg, run the HOS simulation, resolve real-world
locations for every stop, and build the daily ELD logs — returning one
JSON-serializable dict ready to hand back from the API (and to store on
the Trip model).
"""

from __future__ import annotations

from datetime import datetime

from trips.services.geo import interpolate_along_path
from trips.services.hos_engine import DutyStatus, RouteLeg, simulate_trip
from trips.services.log_builder import build_daily_logs
from trips.services.routing import GeocodedPlace, RouteResult, geocode, get_route, reverse_geocode
from trips.services.tz_resolver import local_wall_clock_now

LEG_CURRENT_TO_PICKUP = "current -> pickup"
LEG_PICKUP_TO_DROPOFF = "pickup -> dropoff"


DEFAULT_VEHICLE_INFO = {
    "carrier_name": "",
    "main_office_address": "",
    "truck_number": "",
    "trailer_number": "",
    "driver_name": "",
    "co_driver_name": "",
    "shipping_doc_number": "",
}


def plan_trip(
    current_location_text: str,
    pickup_location_text: str,
    dropoff_location_text: str,
    current_cycle_used_hours: float,
    start_datetime: datetime | None = None,
    vehicle_info: dict | None = None,
) -> dict:
    vehicle_info = {**DEFAULT_VEHICLE_INFO, **(vehicle_info or {})}
    current = geocode(current_location_text)
    pickup = geocode(pickup_location_text)
    dropoff = geocode(dropoff_location_text)

    # HOS clocks run on wall-clock time at the driver's location, not the
    # server's — resolve "now" in the timezone nearest the trip's start.
    if start_datetime is not None:
        timezone_name = "UTC"
    else:
        start_datetime, timezone_name = local_wall_clock_now(current.lat, current.lon)

    leg1_route = get_route(current, pickup)
    leg2_route = get_route(pickup, dropoff)

    legs = [
        RouteLeg(LEG_CURRENT_TO_PICKUP, leg1_route.distance_miles, leg1_route.duration_hours),
        RouteLeg(LEG_PICKUP_TO_DROPOFF, leg2_route.distance_miles, leg2_route.duration_hours),
    ]

    segments = simulate_trip(legs, current_cycle_used_hours, start_datetime)

    leg_lookup = {
        LEG_CURRENT_TO_PICKUP: {"start": current, "end": pickup, "geometry": leg1_route.geometry},
        LEG_PICKUP_TO_DROPOFF: {"start": pickup, "end": dropoff, "geometry": leg2_route.geometry},
    }
    _resolve_segment_locations(segments, leg_lookup)

    daily_logs = build_daily_logs(segments)

    return _build_result_dict(
        current=current,
        pickup=pickup,
        dropoff=dropoff,
        leg_routes={LEG_CURRENT_TO_PICKUP: leg1_route, LEG_PICKUP_TO_DROPOFF: leg2_route},
        segments=segments,
        daily_logs=daily_logs,
        start_datetime=start_datetime,
        timezone_name=timezone_name,
        current_cycle_used_hours=current_cycle_used_hours,
        vehicle_info=vehicle_info,
        inputs={
            "current_location": current_location_text,
            "pickup_location": pickup_location_text,
            "dropoff_location": dropoff_location_text,
        },
    )


def _resolve_segment_locations(segments, leg_lookup) -> None:
    cache: dict[tuple[str, float], dict] = {}
    for seg in segments:
        if seg.leg_name is None:
            continue
        leg = leg_lookup[seg.leg_name]
        fraction = seg.leg_progress_fraction if seg.leg_progress_fraction is not None else 0.0

        if fraction <= 1e-6:
            place: GeocodedPlace = leg["start"]
            seg.resolved_location = {"lat": place.lat, "lon": place.lon, "label": place.label}
        elif fraction >= 1 - 1e-6:
            place = leg["end"]
            seg.resolved_location = {"lat": place.lat, "lon": place.lon, "label": place.label}
        else:
            cache_key = (seg.leg_name, round(fraction, 4))
            if cache_key not in cache:
                lat, lon = interpolate_along_path(leg["geometry"], fraction)
                label = reverse_geocode(lat, lon)
                cache[cache_key] = {"lat": lat, "lon": lon, "label": label}
            seg.resolved_location = cache[cache_key]


def _build_result_dict(
    *,
    current: GeocodedPlace,
    pickup: GeocodedPlace,
    dropoff: GeocodedPlace,
    leg_routes: dict[str, RouteResult],
    segments,
    daily_logs,
    start_datetime: datetime,
    timezone_name: str,
    current_cycle_used_hours: float,
    vehicle_info: dict,
    inputs: dict,
) -> dict:
    def place_dict(p: GeocodedPlace) -> dict:
        return {"lat": p.lat, "lon": p.lon, "label": p.label}

    total_distance_miles = sum(r.distance_miles for r in leg_routes.values())
    driving_hours = sum(s.duration_hours for s in segments if s.status == DutyStatus.DRIVING)
    on_duty_hours = sum(
        s.duration_hours for s in segments if s.status == DutyStatus.ON_DUTY_NOT_DRIVING
    )
    off_duty_hours = sum(
        s.duration_hours
        for s in segments
        if s.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH)
    )
    trip_end = segments[-1].end if segments else start_datetime
    total_trip_duration_hours = (trip_end - start_datetime).total_seconds() / 3600.0

    combined_geometry = []
    legs_out = []
    for name, route in leg_routes.items():
        geometry = [[lat, lon] for lat, lon in route.geometry]
        legs_out.append(
            {
                "name": name,
                "distance_miles": round(route.distance_miles, 2),
                "duration_hours": round(route.duration_hours, 3),
                "geometry": geometry,
                "steps": [
                    {
                        "instruction": s.instruction,
                        "distance_miles": round(s.distance_miles, 2),
                        "duration_hours": round(s.duration_hours, 3),
                    }
                    for s in route.steps
                ],
            }
        )
        combined_geometry.extend(geometry)

    stops = [
        {
            "status": s.status.value,
            "label": s.label,
            "start": s.start.isoformat(),
            "end": s.end.isoformat(),
            "duration_hours": round(s.duration_hours, 3),
            "location": s.resolved_location,
        }
        for s in segments
        if s.status != DutyStatus.DRIVING
    ]

    def count_label(substring: str) -> int:
        return sum(1 for s in segments if substring in s.label)

    return {
        "input": {
            **inputs,
            "current_cycle_used_hours": current_cycle_used_hours,
            "trip_start": start_datetime.isoformat(),
            "timezone": timezone_name,
        },
        "vehicle_info": vehicle_info,
        "waypoints": {
            "current": place_dict(current),
            "pickup": place_dict(pickup),
            "dropoff": place_dict(dropoff),
        },
        "route": {
            "total_distance_miles": round(total_distance_miles, 2),
            "legs": legs_out,
            "geometry": combined_geometry,
        },
        "summary": {
            "total_trip_duration_hours": round(total_trip_duration_hours, 2),
            "total_days": len(daily_logs),
            "driving_hours": round(driving_hours, 2),
            "on_duty_not_driving_hours": round(on_duty_hours, 2),
            "off_duty_hours": round(off_duty_hours, 2),
            "num_fuel_stops": count_label("Fuel stop"),
            "num_10hr_resets": count_label("10-hour rest period"),
            "num_34hr_restarts": count_label("34-hour restart"),
        },
        "stops": stops,
        "daily_logs": [
            {
                "date": log.date,
                "day_index": log.day_index,
                "total_miles": log.total_miles,
                "totals": {status.value: hours for status, hours in log.totals.items()},
                "blocks": [
                    {
                        "status": b.status.value,
                        "start_hour": round(b.start_hour, 3),
                        "end_hour": round(b.end_hour, 3),
                    }
                    for b in log.blocks
                ],
                "remarks": [
                    {
                        "hour": round(r.hour, 3),
                        "location_label": r.location_label,
                        "activity_label": r.activity_label,
                    }
                    for r in log.remarks
                ],
            }
            for log in daily_logs
        ],
    }
