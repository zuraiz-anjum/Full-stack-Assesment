"""
Tests for the orchestration layer -- this is deliberately separate from
the HOS-engine tests because it's where a real bug lived (driving segments
were tagged with their arrival location instead of departure location,
so a remark for "left Chicago" said "arrived in Indianapolis" instead).
That bug shipped and was only caught by manually reading a screenshot;
these tests exist so that doesn't happen again silently.

Routing/geocoding is mocked throughout -- this suite never makes a real
network call, so it runs fast and doesn't depend on the ORS API being up.
"""

from datetime import datetime
from unittest import TestCase
from unittest.mock import patch

from trips.services.routing import GeocodedPlace, RouteResult, RouteStep
from trips.services.trip_planner import plan_trip

CHICAGO = GeocodedPlace(lat=41.8781, lon=-87.6298, label="Chicago, IL, USA")
INDIANAPOLIS = GeocodedPlace(lat=39.7684, lon=-86.1581, label="Indianapolis, IN, USA")
NASHVILLE = GeocodedPlace(lat=36.1627, lon=-86.7816, label="Nashville, TN, USA")

GEOCODE_BY_TEXT = {
    "Chicago, IL": CHICAGO,
    "Indianapolis, IN": INDIANAPOLIS,
    "Nashville, TN": NASHVILLE,
}


def fake_geocode(text):
    return GEOCODE_BY_TEXT[text]


def make_route(start, end, distance_miles, duration_hours, n_points=5):
    geometry = [
        (
            start.lat + (end.lat - start.lat) * i / (n_points - 1),
            start.lon + (end.lon - start.lon) * i / (n_points - 1),
        )
        for i in range(n_points)
    ]
    return RouteResult(
        distance_miles=distance_miles,
        duration_hours=duration_hours,
        geometry=geometry,
        steps=[RouteStep(instruction="Head toward destination", distance_miles=distance_miles, duration_hours=duration_hours)],
    )


class PlanTripStructureTests(TestCase):
    """A short trip, well within every HOS limit -- no breaks inserted."""

    @patch("trips.services.trip_planner.geocode", side_effect=fake_geocode)
    @patch("trips.services.trip_planner.get_route")
    def setUp(self, mock_get_route, mock_geocode):
        def route_side_effect(start, end):
            if start is CHICAGO:
                return make_route(CHICAGO, INDIANAPOLIS, 100, 2)
            return make_route(INDIANAPOLIS, NASHVILLE, 150, 3)

        mock_get_route.side_effect = route_side_effect
        self.result = plan_trip(
            "Chicago, IL",
            "Indianapolis, IN",
            "Nashville, TN",
            current_cycle_used_hours=0,
            start_datetime=datetime(2026, 1, 5, 6, 0),
        )

    def test_top_level_shape(self):
        for key in ("input", "vehicle_info", "waypoints", "route", "summary", "stops", "daily_logs"):
            self.assertIn(key, self.result)

    def test_waypoints_match_geocoded_places(self):
        self.assertEqual(self.result["waypoints"]["current"]["label"], "Chicago, IL, USA")
        self.assertEqual(self.result["waypoints"]["pickup"]["label"], "Indianapolis, IN, USA")
        self.assertEqual(self.result["waypoints"]["dropoff"]["label"], "Nashville, TN, USA")

    def test_route_distance_is_sum_of_both_legs(self):
        self.assertAlmostEqual(self.result["route"]["total_distance_miles"], 250.0)

    def test_summary_driving_hours_matches_legs(self):
        self.assertAlmostEqual(self.result["summary"]["driving_hours"], 5.0)

    def test_no_breaks_needed_for_a_short_trip(self):
        self.assertEqual(self.result["summary"]["num_10hr_resets"], 0)
        self.assertEqual(self.result["summary"]["num_34hr_restarts"], 0)

    def test_steps_are_included_per_leg(self):
        self.assertEqual(len(self.result["route"]["legs"]), 2)
        for leg in self.result["route"]["legs"]:
            self.assertTrue(leg["steps"])

    def test_vehicle_info_defaults_to_blank_when_not_provided(self):
        self.assertEqual(self.result["vehicle_info"]["carrier_name"], "")
        self.assertEqual(self.result["vehicle_info"]["driver_name"], "")

    def test_pickup_and_dropoff_stops_resolve_to_the_correct_endpoint(self):
        # Regression guard: these must be the ARRIVAL point, not swapped.
        pickup_stop = next(s for s in self.result["stops"] if "Pickup" in s["label"])
        dropoff_stop = next(s for s in self.result["stops"] if "Drop-off" in s["label"])
        self.assertEqual(pickup_stop["location"]["label"], "Indianapolis, IN, USA")
        self.assertEqual(dropoff_stop["location"]["label"], "Nashville, TN, USA")


class VehicleInfoPassthroughTests(TestCase):
    @patch("trips.services.trip_planner.geocode", side_effect=fake_geocode)
    @patch("trips.services.trip_planner.get_route")
    def test_provided_vehicle_info_flows_through_unchanged(self, mock_get_route, mock_geocode):
        mock_get_route.side_effect = lambda start, end: make_route(start, end, 50, 1)
        result = plan_trip(
            "Chicago, IL",
            "Indianapolis, IN",
            "Nashville, TN",
            current_cycle_used_hours=0,
            start_datetime=datetime(2026, 1, 5, 6, 0),
            vehicle_info={"carrier_name": "Acme Freight LLC", "driver_name": "John Doe"},
        )
        self.assertEqual(result["vehicle_info"]["carrier_name"], "Acme Freight LLC")
        self.assertEqual(result["vehicle_info"]["driver_name"], "John Doe")
        # Fields not provided still default to blank rather than being absent.
        self.assertEqual(result["vehicle_info"]["trailer_number"], "")


class TimezoneResolutionIntegrationTests(TestCase):
    @patch("trips.services.trip_planner.geocode", side_effect=fake_geocode)
    @patch("trips.services.trip_planner.get_route")
    def test_omitting_start_datetime_resolves_a_real_timezone(self, mock_get_route, mock_geocode):
        mock_get_route.side_effect = lambda start, end: make_route(start, end, 50, 1)
        result = plan_trip(
            "Chicago, IL", "Indianapolis, IN", "Nashville, TN", current_cycle_used_hours=0
        )
        # Chicago -> Central time, not UTC and not an arbitrary default.
        self.assertEqual(result["input"]["timezone"], "America/Chicago")

    @patch("trips.services.trip_planner.geocode", side_effect=fake_geocode)
    @patch("trips.services.trip_planner.get_route")
    def test_explicit_start_datetime_is_respected(self, mock_get_route, mock_geocode):
        mock_get_route.side_effect = lambda start, end: make_route(start, end, 50, 1)
        fixed = datetime(2026, 3, 1, 8, 0)
        result = plan_trip(
            "Chicago, IL",
            "Indianapolis, IN",
            "Nashville, TN",
            current_cycle_used_hours=0,
            start_datetime=fixed,
        )
        self.assertEqual(result["input"]["trip_start"], fixed.isoformat())


class MidRouteLocationResolutionTests(TestCase):
    """
    A long enough leg to force a mandatory break mid-drive -- verifies the
    break gets resolved via interpolation + reverse geocoding rather than
    being left blank or mis-tagged with an endpoint.
    """

    @patch("trips.services.trip_planner.reverse_geocode", return_value="Somewhere, IN, USA")
    @patch("trips.services.trip_planner.geocode", side_effect=fake_geocode)
    @patch("trips.services.trip_planner.get_route")
    def test_break_location_is_interpolated_and_reverse_geocoded(
        self, mock_get_route, mock_geocode, mock_reverse_geocode
    ):
        def route_side_effect(start, end):
            if start is CHICAGO:
                return make_route(CHICAGO, INDIANAPOLIS, 10, 0.2)
            return make_route(INDIANAPOLIS, NASHVILLE, 900, 9, n_points=10)

        mock_get_route.side_effect = route_side_effect
        result = plan_trip(
            "Chicago, IL",
            "Indianapolis, IN",
            "Nashville, TN",
            current_cycle_used_hours=0,
            start_datetime=datetime(2026, 1, 5, 6, 0),
        )
        break_stop = next(s for s in result["stops"] if "30-minute break" in s["label"])
        self.assertEqual(break_stop["location"]["label"], "Somewhere, IN, USA")
        mock_reverse_geocode.assert_called()
