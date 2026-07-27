from datetime import datetime, timedelta
from unittest import TestCase

from trips.services.hos_engine import (
    DutyStatus,
    RouteLeg,
    TripTooLongError,
    simulate_trip,
)

START = datetime(2026, 1, 5, 6, 0)  # Monday 6:00 AM


class ShortTripNoBreaksTests(TestCase):
    """A trip well within every limit should need no rest insertions at all."""

    def setUp(self):
        legs = [
            RouteLeg("current -> pickup", distance_miles=100, duration_hours=2),
            RouteLeg("pickup -> dropoff", distance_miles=150, duration_hours=3),
        ]
        self.segments = simulate_trip(legs, current_cycle_used_hours=0, start_datetime=START)

    def test_segment_sequence(self):
        statuses = [s.status for s in self.segments]
        self.assertEqual(
            statuses,
            [
                DutyStatus.DRIVING,
                DutyStatus.ON_DUTY_NOT_DRIVING,
                DutyStatus.DRIVING,
                DutyStatus.ON_DUTY_NOT_DRIVING,
            ],
        )

    def test_durations(self):
        self.assertAlmostEqual(self.segments[0].duration_hours, 2)
        self.assertAlmostEqual(self.segments[1].duration_hours, 1)
        self.assertAlmostEqual(self.segments[2].duration_hours, 3)
        self.assertAlmostEqual(self.segments[3].duration_hours, 1)

    def test_contiguous_timeline(self):
        for prev, nxt in zip(self.segments, self.segments[1:]):
            self.assertEqual(prev.end, nxt.start)
        self.assertEqual(self.segments[0].start, START)

    def test_total_distance_matches_legs(self):
        total_miles = sum(s.miles for s in self.segments)
        self.assertAlmostEqual(total_miles, 250)


class MandatoryBreakTests(TestCase):
    """8 cumulative driving hours must trigger a 30-minute break."""

    def setUp(self):
        legs = [
            RouteLeg("current -> pickup", distance_miles=10, duration_hours=0.2),
            RouteLeg("pickup -> dropoff", distance_miles=900, duration_hours=9),
        ]
        self.segments = simulate_trip(legs, current_cycle_used_hours=0, start_datetime=START)

    def test_break_is_inserted_after_eight_hours_driving(self):
        statuses = [s.status for s in self.segments]
        self.assertEqual(
            statuses,
            [
                DutyStatus.DRIVING,
                DutyStatus.ON_DUTY_NOT_DRIVING,
                DutyStatus.DRIVING,
                DutyStatus.OFF_DUTY,
                DutyStatus.DRIVING,
                DutyStatus.ON_DUTY_NOT_DRIVING,
            ],
        )
        break_segment = self.segments[3]
        self.assertAlmostEqual(break_segment.duration_hours, 0.5)
        self.assertIn("30-minute break", break_segment.label)

        driving_before_break = self.segments[2].duration_hours
        self.assertAlmostEqual(driving_before_break, 8.0)

    def test_break_time_does_not_count_toward_cycle(self):
        on_duty_hours = sum(
            s.duration_hours
            for s in self.segments
            if s.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING)
        )
        # 0.2 + 1 + 8 + 1 + 1 = 11.2 hours of actual on-duty time
        self.assertAlmostEqual(on_duty_hours, 11.2)

    def test_total_trip_span_includes_break(self):
        total_hours = (self.segments[-1].end - self.segments[0].start).total_seconds() / 3600
        self.assertAlmostEqual(total_hours, 11.7)


class CycleRestartTests(TestCase):
    """Starting near the 70-hour cap should force an immediate 34-hour restart."""

    def setUp(self):
        legs = [
            RouteLeg("current -> pickup", distance_miles=50, duration_hours=1),
            RouteLeg("pickup -> dropoff", distance_miles=50, duration_hours=1),
        ]
        self.segments = simulate_trip(
            legs, current_cycle_used_hours=69.5, start_datetime=START
        )

    def test_restart_is_inserted(self):
        restarts = [s for s in self.segments if "34-hour restart" in s.label]
        self.assertEqual(len(restarts), 1)
        self.assertAlmostEqual(restarts[0].duration_hours, 34.0)

    def test_restart_happens_before_cycle_would_exceed_seventy(self):
        # The first driving chunk should be capped at 0.5h (70 - 69.5) before the restart.
        self.assertEqual(self.segments[0].status, DutyStatus.DRIVING)
        self.assertAlmostEqual(self.segments[0].duration_hours, 0.5)
        self.assertEqual(self.segments[1].status, DutyStatus.OFF_DUTY)

    def test_final_cycle_used_only_counts_post_restart_on_duty_time(self):
        # After the restart: 0.5 (drive) + 1 (pickup) + 1 (drive) + 1 (dropoff) = 3.5h
        post_restart = self.segments[2:]
        on_duty_hours = sum(
            s.duration_hours
            for s in post_restart
            if s.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING)
        )
        self.assertAlmostEqual(on_duty_hours, 3.5)


class LongHaulPropertyTests(TestCase):
    """
    A long single-leg haul (1,200 mi) should trigger, in order: a mandatory
    break, a fuel stop, and an 11-hour-driving-limit reset — and must never
    lose or duplicate any distance or time along the way.
    """

    def setUp(self):
        legs = [
            RouteLeg("current -> pickup", distance_miles=0, duration_hours=0),
            RouteLeg("pickup -> dropoff", distance_miles=1200, duration_hours=12),
        ]
        self.segments = simulate_trip(legs, current_cycle_used_hours=0, start_datetime=START)

    def test_contains_break_fuel_stop_and_reset(self):
        labels = " | ".join(s.label for s in self.segments)
        self.assertIn("30-minute break", labels)
        self.assertIn("Fuel stop", labels)
        self.assertIn("10-hour rest period", labels)

    def test_distance_conservation(self):
        driving_miles = sum(
            s.miles for s in self.segments if s.status == DutyStatus.DRIVING
        )
        self.assertAlmostEqual(driving_miles, 1200, places=3)

    def test_contiguous_no_gaps_or_overlaps(self):
        for prev, nxt in zip(self.segments, self.segments[1:]):
            self.assertEqual(prev.end, nxt.start)

    def test_never_exceeds_eleven_driving_hours_between_resets(self):
        running_drive_hours = 0.0
        for s in self.segments:
            if s.status == DutyStatus.DRIVING:
                running_drive_hours += s.duration_hours
                self.assertLessEqual(running_drive_hours, 11.0 + 1e-6)
            elif "10-hour rest period" in s.label or "34-hour restart" in s.label:
                running_drive_hours = 0.0

    def test_never_exceeds_eight_hours_driving_without_a_break(self):
        running_since_break = 0.0
        for s in self.segments:
            if s.status == DutyStatus.DRIVING:
                running_since_break += s.duration_hours
                self.assertLessEqual(running_since_break, 8.0 + 1e-6)
            elif s.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH) or "Fuel stop" in s.label:
                if s.duration_hours >= 0.5 - 1e-9:
                    running_since_break = 0.0


class DegenerateInputTests(TestCase):
    def test_zero_distance_trip_still_adds_pickup_and_dropoff_stops(self):
        legs = [
            RouteLeg("current -> pickup", distance_miles=0, duration_hours=0),
            RouteLeg("pickup -> dropoff", distance_miles=0, duration_hours=0),
        ]
        segments = simulate_trip(legs, current_cycle_used_hours=0, start_datetime=START)
        self.assertEqual(len(segments), 2)
        self.assertTrue(all(s.status == DutyStatus.ON_DUTY_NOT_DRIVING for s in segments))
        self.assertAlmostEqual(segments[0].duration_hours, 1)
        self.assertAlmostEqual(segments[1].duration_hours, 1)
