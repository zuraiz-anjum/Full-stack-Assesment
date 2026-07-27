"""
Turns a chronological list of HOSEngine DutySegments into one FMCSA-style
daily log per calendar day: 24-hour blocks per duty status, per-status
totals (always summing to exactly 24.0), and remarks at each status change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from trips.services.hos_engine import DutySegment, DutyStatus

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


def _hours_between(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600.0


def build_daily_logs(segments: list[DutySegment]) -> list[DailyLog]:
    """`segments` must be contiguous and chronological (as produced by simulate_trip)."""
    if not segments:
        return []

    trip_start_date = segments[0].start.date()
    trip_end_date = segments[-1].end.date()

    logs: list[DailyLog] = []
    day_index = 1
    current_date = trip_start_date

    while current_date <= trip_end_date:
        day_start = datetime.combine(current_date, datetime.min.time())
        day_end = day_start + timedelta(days=1)

        blocks: list[LogBlock] = []
        remarks: list[Remark] = []
        totals = {s: 0.0 for s in ALL_STATUSES}
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

        logs.append(
            DailyLog(
                date=current_date.isoformat(),
                day_index=day_index,
                blocks=blocks,
                totals=totals,
                remarks=remarks,
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
