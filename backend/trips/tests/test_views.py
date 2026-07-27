"""
Tests for the actual HTTP contract of the API -- request/response shapes,
status codes, and error handling. `plan_trip` is mocked throughout so
these never touch the network; that's `test_trip_planner.py`'s job.
"""

from unittest.mock import patch

from django.core.cache import cache
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
    def test_created_trip_is_tagged_with_the_requesting_owner_token(self, mock_plan_trip):
        self.client.post("/api/trips/", VALID_PAYLOAD, format="json", HTTP_X_OWNER_TOKEN="my-token")
        self.assertEqual(Trip.objects.get().owner_token, "my-token")

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
    OWNER = "owner-token-a"

    def setUp(self):
        self.trip = Trip.objects.create(
            current_location="Chicago, IL",
            pickup_location="Indianapolis, IN",
            dropoff_location="Nashville, TN",
            current_cycle_used_hours=10,
            result=FAKE_RESULT,
            owner_token=self.OWNER,
        )

    def test_list_returns_created_trips(self):
        resp = self.client.get("/api/trips/", HTTP_X_OWNER_TOKEN=self.OWNER)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["id"], self.trip.id)

    def test_list_does_not_leak_get_throttled(self):
        # Browsing history should never be rate-limited (only POST is).
        for _ in range(30):
            resp = self.client.get("/api/trips/", HTTP_X_OWNER_TOKEN=self.OWNER)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_detail_returns_full_result(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/", HTTP_X_OWNER_TOKEN=self.OWNER)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["result"], FAKE_RESULT)

    def test_detail_404s_for_missing_trip(self):
        resp = self.client.get("/api/trips/999999/", HTTP_X_OWNER_TOKEN=self.OWNER)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_list_does_not_include_another_owners_trips(self):
        resp = self.client.get("/api/trips/", HTTP_X_OWNER_TOKEN="someone-elses-token")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])

    def test_list_with_no_token_does_not_include_another_owners_trips(self):
        resp = self.client.get("/api/trips/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])

    def test_detail_404s_for_another_owners_trip(self):
        # Trip IDs are sequential and guessable -- confirms a visitor can't
        # page through /api/trips/<id>/ and read someone else's route,
        # vehicle info, or driver details just by trying nearby IDs.
        resp = self.client.get(f"/api/trips/{self.trip.id}/", HTTP_X_OWNER_TOKEN="someone-elses-token")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_404s_for_request_with_no_token(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class TripPdfTests(APITestCase):
    OWNER = "owner-token-pdf"

    def setUp(self):
        self.trip = Trip.objects.create(
            current_location="Chicago, IL",
            pickup_location="Indianapolis, IN",
            dropoff_location="Nashville, TN",
            current_cycle_used_hours=10,
            result=FAKE_RESULT,
            owner_token=self.OWNER,
        )

    def test_returns_a_pdf_for_the_owner(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/pdf/", HTTP_X_OWNER_TOKEN=self.OWNER)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertIn(f"trip-{self.trip.id}-daily-logs.pdf", resp["Content-Disposition"])
        self.assertEqual(resp.content[:4], b"%PDF")

    def test_404s_for_another_owners_trip(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/pdf/", HTTP_X_OWNER_TOKEN="someone-elses-token")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_404s_for_request_with_no_token(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/pdf/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class SharedTripTests(APITestCase):
    """The public share-link endpoints -- deliberately not owner-token
    scoped, since the whole point is that someone without the owner's
    token (e.g. a dispatcher who was just sent the link) can view it."""

    def setUp(self):
        self.trip = Trip.objects.create(
            current_location="Chicago, IL",
            pickup_location="Indianapolis, IN",
            dropoff_location="Nashville, TN",
            current_cycle_used_hours=10,
            result=FAKE_RESULT,
            owner_token="the-actual-owner",
        )

    def test_shared_detail_works_with_no_owner_token_at_all(self):
        resp = self.client.get(f"/api/shared/{self.trip.share_token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["result"], FAKE_RESULT)

    def test_shared_detail_does_not_echo_the_share_token_back(self):
        resp = self.client.get(f"/api/shared/{self.trip.share_token}/")
        self.assertNotIn("share_token", resp.data)

    def test_shared_detail_404s_for_a_random_token(self):
        resp = self.client.get("/api/shared/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_shared_pdf_works_with_no_owner_token(self):
        resp = self.client.get(f"/api/shared/{self.trip.share_token}/pdf/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp["Content-Type"], "application/pdf")

    def test_owner_detail_response_includes_a_share_token_to_hand_out(self):
        resp = self.client.get(f"/api/trips/{self.trip.id}/", HTTP_X_OWNER_TOKEN="the-actual-owner")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(str(self.trip.share_token), resp.data["share_token"])

    def test_two_trips_never_share_a_token(self):
        other = Trip.objects.create(
            current_location="A", pickup_location="B", dropoff_location="C",
            current_cycle_used_hours=0, result=FAKE_RESULT,
        )
        self.assertNotEqual(self.trip.share_token, other.share_token)


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


class ThrottlingTests(APITestCase):
    """
    Verifies the throttle scopes actually engage against the real rates
    configured in settings.py (20/hour for trip-create, 60/min for
    autocomplete) -- not just that DEFAULT_THROTTLE_RATES has entries.

    Note: DRF's SimpleRateThrottle reads DEFAULT_THROTTLE_RATES into a
    class attribute at import time (`THROTTLE_RATES = api_settings.
    DEFAULT_THROTTLE_RATES`), so @override_settings on REST_FRAMEWORK
    does NOT affect it mid-test -- these tests exercise the actual
    configured limits instead of trying to override them.
    """

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("trips.views.routing.autocomplete", return_value=[])
    def test_autocomplete_throttles_after_the_configured_rate(self, mock_autocomplete):
        from rest_framework.settings import api_settings

        from trips.views import LocationAutocompleteView

        limit = api_settings.DEFAULT_THROTTLE_RATES[LocationAutocompleteView.throttle_scope]
        num_requests = int(limit.split("/")[0])

        for _ in range(num_requests):
            resp = self.client.get("/api/locations/autocomplete/", {"q": "test"})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/locations/autocomplete/", {"q": "test"})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # DRF's default throttle response shape -- confirms the frontend's
        # extractErrorMessage() (which reads response.data.detail) will
        # surface something readable rather than a blank/generic error.
        self.assertIn("detail", resp.data)

    @patch("trips.views.plan_trip", return_value=FAKE_RESULT)
    def test_trip_creation_throttles_after_the_configured_rate(self, mock_plan_trip):
        from rest_framework.settings import api_settings

        limit = api_settings.DEFAULT_THROTTLE_RATES["trip-create"]
        num_requests = int(limit.split("/")[0])

        for _ in range(num_requests):
            resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        resp = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_get_history_is_never_throttled_even_after_post_throttling_kicks_in(self):
        from rest_framework.settings import api_settings

        limit = api_settings.DEFAULT_THROTTLE_RATES["trip-create"]
        num_requests = int(limit.split("/")[0])

        with patch("trips.views.plan_trip", return_value=FAKE_RESULT):
            for _ in range(num_requests):
                self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
            throttled = self.client.post("/api/trips/", VALID_PAYLOAD, format="json")
        self.assertEqual(throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        for _ in range(10):
            resp = self.client.get("/api/trips/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
