from datetime import datetime
from unittest import TestCase

from trips.services.hos_engine import DutySegment, DutyStatus
from trips.services.log_builder import build_daily_logs


def _seg(status, start, end, label="", location=None, miles=0.0):
    return DutySegment(
        status=status, start=start, end=end, label=label, resolved_location=location, miles=miles
    )


class DailyLogSplittingTests(TestCase):
    def setUp(self):
        d1, d2, d3 = datetime(2026, 1, 5), datetime(2026, 1, 6), datetime(2026, 1, 7)

        self.segments = [
            _seg(
                DutyStatus.OFF_DUTY,
                d1.replace(hour=20),
                d2.replace(hour=6),
                "Overnight rest",
                {"label": "Springfield, IL"},
            ),
            _seg(
                DutyStatus.DRIVING,
                d2.replace(hour=6),
                d2.replace(hour=14),
                "Driving",
                {"label": "Springfield, IL"},
            ),
            _seg(
                DutyStatus.ON_DUTY_NOT_DRIVING,
                d2.replace(hour=14),
                d2.replace(hour=15),
                "Drop-off",
                {"label": "Terre Haute, IN"},
            ),
            _seg(
                DutyStatus.OFF_DUTY,
                d2.replace(hour=15),
                d3.replace(hour=1),
                "Overnight rest",
                {"label": "Terre Haute, IN"},
            ),
        ]
        self.logs = build_daily_logs(self.segments)

    def test_produces_three_calendar_days(self):
        self.assertEqual([log.date for log in self.logs], ["2026-01-05", "2026-01-06", "2026-01-07"])

    def test_each_day_totals_exactly_24_hours(self):
        for log in self.logs:
            self.assertAlmostEqual(sum(log.totals.values()), 24.0, places=6)

    def test_day_one_is_mostly_off_duty_filler_plus_the_real_segment(self):
        day1 = self.logs[0]
        self.assertAlmostEqual(day1.totals[DutyStatus.OFF_DUTY], 24.0)
        # Filler block (00:00-20:00) + real segment clipped to day end (20:00-24:00)
        self.assertEqual(len(day1.blocks), 2)
        self.assertEqual(len(day1.remarks), 1)
        self.assertAlmostEqual(day1.remarks[0].hour, 20.0)

    def test_day_two_has_no_remark_for_midnight_continuation(self):
        day2 = self.logs[1]
        # 3 real status changes happen on day 2 (driving, drop-off, overnight rest)
        # but NOT the off-duty block that merely continues from day 1.
        self.assertEqual(len(day2.remarks), 3)
        self.assertAlmostEqual(day2.totals[DutyStatus.OFF_DUTY], 15.0)
        self.assertAlmostEqual(day2.totals[DutyStatus.DRIVING], 8.0)
        self.assertAlmostEqual(day2.totals[DutyStatus.ON_DUTY_NOT_DRIVING], 1.0)

    def test_day_three_has_tail_filler_after_trip_ends(self):
        day3 = self.logs[2]
        self.assertAlmostEqual(day3.totals[DutyStatus.OFF_DUTY], 24.0)
        self.assertEqual(len(day3.remarks), 0)

    def test_empty_segments_returns_empty_logs(self):
        self.assertEqual(build_daily_logs([]), [])


class PerDayMileageTests(TestCase):
    def test_mileage_is_prorated_across_a_midnight_crossing_drive(self):
        d1, d2 = datetime(2026, 1, 5), datetime(2026, 1, 6)
        # 8-hour, 400-mile drive from 22:00 to 06:00 -- 2h/100mi on day 1,
        # 6h/300mi on day 2.
        segments = [
            _seg(DutyStatus.DRIVING, d1.replace(hour=22), d2.replace(hour=6), "Driving", miles=400.0),
        ]
        logs = build_daily_logs(segments)
        self.assertEqual(len(logs), 2)
        self.assertAlmostEqual(logs[0].total_miles, 100.0, places=1)
        self.assertAlmostEqual(logs[1].total_miles, 300.0, places=1)

    def test_non_driving_segments_dont_add_mileage(self):
        d1 = datetime(2026, 1, 5)
        segments = [
            _seg(DutyStatus.ON_DUTY_NOT_DRIVING, d1.replace(hour=6), d1.replace(hour=7), "Pickup"),
        ]
        logs = build_daily_logs(segments)
        self.assertAlmostEqual(logs[0].total_miles, 0.0)
