from unittest import TestCase

from trips.services.tz_resolver import resolve_us_timezone


class TimezoneResolutionTests(TestCase):
    def test_new_york(self):
        self.assertEqual(str(resolve_us_timezone(40.7128, -74.0060)), "America/New_York")

    def test_chicago(self):
        self.assertEqual(str(resolve_us_timezone(41.8781, -87.6298)), "America/Chicago")

    def test_denver(self):
        self.assertEqual(str(resolve_us_timezone(39.7392, -104.9903)), "America/Denver")

    def test_los_angeles(self):
        self.assertEqual(str(resolve_us_timezone(34.0522, -118.2437)), "America/Los_Angeles")

    def test_honolulu(self):
        self.assertEqual(str(resolve_us_timezone(21.3069, -157.8583)), "Pacific/Honolulu")

    def test_anchorage(self):
        self.assertEqual(str(resolve_us_timezone(61.2181, -149.9003)), "America/Anchorage")
