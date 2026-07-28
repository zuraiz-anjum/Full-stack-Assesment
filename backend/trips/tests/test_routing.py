"""
Verifies the geocoding layer restriction added after a real bug report:
typing a bare state name (e.g. "Indiana") let the autocomplete dropdown
suggest "Indiana, USA" as the top pick, which geocoded to that state's
centroid -- a point frequently nowhere near a road, so routing then failed
downstream with a confusing "couldn't find a drivable route" error.
"""

from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from trips.services.routing import SPECIFIC_PLACE_LAYERS, RoutingError, autocomplete, geocode


def _ors_response(features):
    resp = Mock()
    resp.status_code = 200
    resp.json.return_value = {"features": features}
    return resp


def _feature(label, lon, lat):
    return {"geometry": {"coordinates": [lon, lat]}, "properties": {"label": label}}


@override_settings(ORS_API_KEY="test-key")
class GeocodeLayerRestrictionTests(TestCase):
    @patch("trips.services.routing.requests.get")
    def test_search_request_excludes_coarse_admin_layers(self, mock_get):
        mock_get.return_value = _ors_response([_feature("Indianapolis, IN, USA", -86.15, 39.77)])
        geocode("Indiana")
        params = mock_get.call_args.kwargs["params"]
        self.assertEqual(params["layers"], SPECIFIC_PLACE_LAYERS)
        self.assertNotIn("region", params["layers"].split(","))

    @patch("trips.services.routing.requests.get")
    def test_autocomplete_request_excludes_coarse_admin_layers(self, mock_get):
        mock_get.return_value = _ors_response([_feature("New Brunswick, NJ, USA", -74.45, 40.5)])
        autocomplete("New Jersey")
        params = mock_get.call_args.kwargs["params"]
        self.assertEqual(params["layers"], SPECIFIC_PLACE_LAYERS)

    @patch("trips.services.routing.requests.get")
    def test_no_matches_raises_a_message_suggesting_more_specific_input(self, mock_get):
        mock_get.return_value = _ors_response([])
        with self.assertRaises(RoutingError) as ctx:
            geocode("Indiana")
        self.assertIn("city name or a full address", str(ctx.exception))
