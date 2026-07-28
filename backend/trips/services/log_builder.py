"""
Turns a chronological list of HOSEngine DutySegments into one FMCSA-style
daily log per calendar day: 24-hour blocks per duty status, per-status
totals (always summing to exactly 24.0), and remarks at each status change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from trips.services.hos_engine import DutySegment, DutyStatus, RESTART_LABEL

ALL_STATUSES = [
    DutyStatus.OFF_DUTY,
    DutyStatus.SLEEPER_BERTH,
    DutyStatus.DRIVING,
    DutyStatus.ON_DUTY_NOT_DRIVING,
]


@dataclass
class LogBlock:
    status: DutyStatus
    start_hour: float  # hours since midnight of this log's day, 0..24
    end_hour: float


@dataclass
class Remark:
    hour: float
    location_label: str
    activity_label: str


@dataclass
class DailyLog:
    date: str  # ISO date, e.g. "2026-01-05"
    day_index: int
    blocks: list[LogBlock] = field(default_factory=list)
    totals: dict = field(default_factory=dict)
    remarks: list[Remark] = field(default_factory=list)
    total_miles: float = 0.0
    # Where the truck was at the start/end of this calendar day, for the
    # paper form's From/To boxes. On a day with no status changes at all
    # (e.g. the middle day of a multi-day 34-hour restart), there's no
    # remark to read a location from, so this carries forward the last
    # known location instead of leaving it blank -- the truck didn't teleport
    # away, it's still sitting wherever it stopped.
    from_location: str = ""
    to_location: str = ""
    # Hours on duty (driving + on-duty-not-driving) since the last 34-hour
    # restart, including today -- the same number the 70-hour/8-day cycle
    # limit is checked against, and what the paper form's recap box "A"
    # line asks for.
    cycle_hours_used: float = 0.0


def _hours_between(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600.0


def build_daily_logs(segments: list[DutySegment], current_cycle_used_hours: float = 0.0) -> list[DailyLog]:
    """`segments` must be contiguous and chronological (as produced by simulate_trip).

    `current_cycle_used_hours` seeds the running on-duty counter used for
    each day's recap "hours on duty since last reset" figure -- the same
    starting value the HOS engine itself was simulated with, so this stays
    consistent with whatever 34-hour restarts the engine actually inserted.
    """
    if not segments:
        return []

    trip_start_date = segments[0].start.date()
    trip_end_date = segments[-1].end.date()

    logs: list[DailyLog] = []
    day_index = 1
    current_date = trip_start_date
    last_known_location = ""
    cycle_used = current_cycle_used_hours

    while current_date <= trip_end_date:
        day_start = datetime.combine(current_date, datetime.min.time())
        day_end = day_start + timedelta(days=1)

        blocks: list[LogBlock] = []
        remarks: list[Remark] = []
        totals = {s: 0.0 for s in ALL_STATUSES}
        total_miles = 0.0
        cursor = day_start

        overlapping = [s for s in segments if s.start < day_end and s.end > day_start]
        for seg in overlapping:
            clip_start = max(seg.start, day_start)
            clip_end = min(seg.end, day_end)

            if clip_start > cursor:
                # Shouldn't happen for contiguous segments, but fill any gap
                # defensively so the grid never has a blank stretch.
                gap_hours = _hours_between(cursor, clip_start)
                blocks.append(
                    LogBlock(
                        DutyStatus.OFF_DUTY,
                        _hours_between(day_start, cursor),
                        _hours_between(day_start, clip_start),
                    )
                )
                totals[DutyStatus.OFF_DUTY] += gap_hours

            start_hour = _hours_between(day_start, clip_start)
            end_hour = _hours_between(day_start, clip_end)
            blocks.append(LogBlock(seg.status, start_hour, end_hour))
            totals[seg.status] += end_hour - start_hour

            if seg.status == DutyStatus.DRIVING and seg.duration_hours > 0:
                clipped_fraction = (end_hour - start_hour) / seg.duration_hours
                total_miles += seg.miles * clipped_fraction

            if seg.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING):
                cycle_used += end_hour - start_hour
            elif seg.label == RESTART_LABEL:
                cycle_used = 0.0

            if clip_start == seg.start:
                location = getattr(seg, "resolved_location", None)
                location_label = location["label"] if location else ""
                remarks.append(
                    Remark(hour=start_hour, location_label=location_label, activity_label=seg.label)
                )

            cursor = clip_end

        if cursor < day_end:
            tail_hours = _hours_between(cursor, day_end)
            blocks.append(
                LogBlock(DutyStatus.OFF_DUTY, _hours_between(day_start, cursor), 24.0)
            )
            totals[DutyStatus.OFF_DUTY] += tail_hours

        _normalize_totals(totals)

        located = [r for r in remarks if r.location_label]
        if located:
            from_location = located[0].location_label
            to_location = located[-1].location_label
            last_known_location = to_location
        else:
            from_location = last_known_location
            to_location = last_known_location

        logs.append(
            DailyLog(
                date=current_date.isoformat(),
                day_index=day_index,
                blocks=blocks,
                totals=totals,
                remarks=remarks,
                total_miles=round(total_miles, 1),
                from_location=from_location,
                to_location=to_location,
                cycle_hours_used=round(cycle_used, 2),
            )
        )

        day_index += 1
        current_date += timedelta(days=1)

    return logs


def _normalize_totals(totals: dict) -> None:
    """Correct floating-point drift so the four totals always sum to exactly 24.0."""
    total = sum(totals.values())
    drift = 24.0 - total
    if abs(drift) < 1e-6:
        return
    largest_status = max(totals, key=totals.get)
    totals[largest_status] = round(totals[largest_status] + drift, 4)
