"""
Tests for the actual HTTP contract of the API -- request/response shapes,
status codes, and error handling. `plan_trip` is mocked throughout so
these never touch the network; that's `test_trip_planner.py`'s job.
"""

from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from trips.models import Trip
from trips.services.hos_engine import TripTooLongError
from trips.services.routing import RoutingError

VALID_PAYLOAD = {
    "current_location": "Chicago, IL",
    "pickup_location": "Indianapolis, IN",
    "dropoff_location": "Nashville, TN",
    "current_cycle_used_hours": 10,
}

FAKE_RESULT = {
    "input": {},
    "vehicle_info": {},
    "waypoints": {},
    "route": {"total_distance_miles": 0, "legs": [], "geometry": []},
    "summary": {},
    "stops": [],
    "daily_logs": [],
}


class TripCreateTests(APITestCase):
    @patch("trips.views.plan_trip", return_value=FAKE_RESULT)
    def test_valid_payload_creates_a_trip_and_returns_201(self, mock_plan_trip):
        resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Trip.objects.count(), 1)
        self.assertEqual(resp.data["result"], FAKE_RESULT)

    @patch("trips.views.plan_trip", return_value=FAKE_RESULT)
    def test_optional_vehicle_fields_are_passed_through(self, mock_plan_trip):
        payload = {**VALID_PAYLOAD, "carrier_name": "Acme Freight LLC"}
        self.client.post("/api/trips/", payload, format="json")
        called_kwargs = mock_plan_trip.call_args.kwargs
        self.assertEqual(called_kwargs["vehicle_info"]["carrier_name"], "Acme Freight LLC")

    def test_missing_required_field_returns_400(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "dropoff_location"}
        resp = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("dropoff_location", resp.data)

    def test_cycle_hours_above_seventy_returns_400(self):
        payload = {**VALID_PAYLOAD, "current_cycle_used_hours": 95}
        resp = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cycle_hours_negative_returns_400(self):
        payload = {**VALID_PAYLOAD, "current_cycle_used_hours": -5}
        resp = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("trips.views.plan_trip", side_effect=RoutingError("Could not find a route."))
    def test_routing_error_returns_400_with_detail(self, mock_plan_trip):
        resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "Could not find a route.")
        self.assertEqual(Trip.objects.count(), 0)

    @patch("trips.views.plan_trip", side_effect=TripTooLongError("Too many iterations."))
    def test_trip_too_long_error_returns_422(self, mock_plan_trip):
        resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(resp.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    @patch("trips.views.plan_trip", side_effect=ValueError("something unexpected"))
    def test_unexpected_exception_returns_500_with_generic_message(self, mock_plan_trip):
        resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        # The raw exception text must NOT leak to the client.
        self.assertNotIn("something unexpected", str(resp.data))


class TripListRetrieveTests(APITestCase):
    def setUp(self):
        self.trip = Trip.objects.create(
            current_location="Chicago, IL",
            pickup_location="Indianapolis, IN",
            dropoff_location="Nashville, TN",
            current_cycle_used_hours=10,
            result=FAKE_RESULT,
        )

    def test_list_returns_created_trips(self):
        resp = self.client.get("/api/trips/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["id"], self.trip.id)

    def test_list_does_not_leak_get_throttled(self):
        # Browsing history should never be rate-limited (only POST is).
        for _ in range(30):
            resp = self.client.get("/api/trips/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_detail_returns_full_result(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["result"], FAKE_RESULT)

    def test_detail_404s_for_missing_trip(self):
        resp = self.client.get("/api/trips/999999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class LocationAutocompleteTests(APITestCase):
    @patch("trips.views.routing.autocomplete")
    def test_returns_places_from_the_routing_service(self, mock_autocomplete):
        from trips.services.routing import GeocodedPlace

        mock_autocomplete.return_value = [
            GeocodedPlace(lat=41.8, lon=-87.6, label="Chicago, IL, USA"),
        ]
        resp = self.client.get("/api/locations/autocomplete/", {"q": "Chic"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [{"label": "Chicago, IL, USA", "lat": 41.8, "lon": -87.6}])

    @patch("trips.views.routing.autocomplete", side_effect=RoutingError("boom"))
    def test_routing_error_returns_empty_list_not_a_crash(self, mock_autocomplete):
        resp = self.client.get("/api/locations/autocomplete/", {"q": "Chic"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])
