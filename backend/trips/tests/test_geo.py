from unittest import TestCase

from trips.services.geo import haversine_miles, interpolate_along_path


class HaversineTests(TestCase):
    def test_known_distance_chicago_to_indianapolis(self):
        # Real-world straight-line distance is ~165 miles.
        d = haversine_miles(41.8781, -87.6298, 39.7684, -86.1581)
        self.assertAlmostEqual(d, 165, delta=5)

    def test_zero_distance_for_identical_points(self):
        self.assertAlmostEqual(haversine_miles(40.0, -90.0, 40.0, -90.0), 0.0)


class InterpolateAlongPathTests(TestCase):
    def setUp(self):
        # A simple 3-point path along the equator, evenly spaced.
        self.coords = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]

    def test_fraction_zero_returns_start(self):
        self.assertEqual(interpolate_along_path(self.coords, 0.0), self.coords[0])

    def test_fraction_one_returns_end(self):
        self.assertEqual(interpolate_along_path(self.coords, 1.0), self.coords[-1])

    def test_fraction_half_returns_midpoint(self):
        lat, lon = interpolate_along_path(self.coords, 0.5)
        self.assertAlmostEqual(lat, 0.0, places=3)
        self.assertAlmostEqual(lon, 1.0, places=1)

    def test_single_point_path_returns_that_point(self):
        self.assertEqual(interpolate_along_path([(5.0, 5.0)], 0.5), (5.0, 5.0))

    def test_empty_path_raises(self):
        with self.assertRaises(ValueError):
            interpolate_along_path([], 0.5)
