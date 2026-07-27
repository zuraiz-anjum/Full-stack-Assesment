"""
Hours-of-Service simulation engine.

Implements the property-carrying driver rules from 49 CFR Part 395 as
summarized in FMCSA's "Interstate Truck Driver's Guide to Hours of Service"
(April 2022):

  - 11-hour driving limit within a
  - 14-hour on-duty "driving window", opened by a 10-consecutive-hour
    off-duty (or equivalent sleeper berth) reset
  - A 30-minute break required after 8 cumulative hours of driving
  - A 70-hour / 8-day on-duty limit, restartable with 34 consecutive
    off-duty hours

Per the assignment's stated assumptions, this engine assumes:
  - a property-carrying driver on the 70-hour/8-day cycle
  - no adverse driving conditions exception
  - a fuel stop at least once every 1,000 miles
  - 1 hour on-duty (not driving) at pickup, and 1 hour at drop-off

This module has no network or Django dependencies so it can be unit
tested in isolation from routing/geocoding.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class DutyStatus(str, Enum):
    OFF_DUTY = "OFF_DUTY"
    SLEEPER_BERTH = "SLEEPER_BERTH"
    DRIVING = "DRIVING"
    ON_DUTY_NOT_DRIVING = "ON_DUTY_NOT_DRIVING"


# --- Regulatory constants (hours / miles) --------------------------------

MAX_DRIVING_HOURS = 11.0
MAX_WINDOW_HOURS = 14.0
MAX_DRIVING_BEFORE_BREAK = 8.0
BREAK_DURATION = 0.5
MIN_OFF_DUTY_RESET = 10.0
MAX_CYCLE_HOURS = 70.0
RESTART_HOURS = 34.0
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_DURATION = 0.5
PICKUP_DROPOFF_DURATION = 1.0

EPSILON = 1e-6
MAX_ITERATIONS = 5000


@dataclass
class RouteLeg:
    """A drivable leg of the trip (e.g. current -> pickup, pickup -> dropoff)."""

    name: str
    distance_miles: float
    duration_hours: float

    @property
    def avg_speed_mph(self) -> float:
        if self.duration_hours <= 0:
            return 0.0
        return self.distance_miles / self.duration_hours


@dataclass
class DutySegment:
    """One contiguous block of a single duty status in the simulated log."""

    status: DutyStatus
    start: datetime
    end: datetime
    label: str
    leg_name: str | None = None
    miles: float = 0.0
    # Fraction (0..1) of `leg_name`'s total distance covered *by the end*
    # of this segment. Used later to interpolate a real-world location.
    leg_progress_fraction: float | None = None
    # Populated by trip_planner after the fact: {"lat":.., "lon":.., "label":..}
    resolved_location: dict | None = None

    @property
    def duration_hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


@dataclass
class _SimState:
    clock: datetime
    cycle_used: float
    driving_since_break: float = 0.0
    driving_in_window: float = 0.0
    window_start: datetime = field(default=None)  # type: ignore[assignment]
    distance_since_fuel: float = 0.0
    # Where the truck physically is right now, expressed as (leg name,
    # fraction of that leg's distance covered) — used to tag inserted
    # rest/fuel stops with a route position for later map/remarks display.
    last_leg_name: str | None = None
    last_fraction: float = 0.0

    def __post_init__(self):
        if self.window_start is None:
            self.window_start = self.clock

    @property
    def window_elapsed(self) -> float:
        return (self.clock - self.window_start).total_seconds() / 3600.0


class TripTooLongError(Exception):
    """Raised if the simulation can't converge in a sane number of steps."""


def simulate_trip(
    legs: list[RouteLeg],
    current_cycle_used_hours: float,
    start_datetime: datetime,
) -> list[DutySegment]:
    """
    Simulate a full trip (current -> pickup -> ... -> dropoff) and return
    the chronological list of duty-status segments, including all required
    rest breaks, 10-hour resets, 34-hour restarts, and fuel/pickup/dropoff
    stops.

    `legs` should be exactly the drivable legs in order; a 1-hour on-duty
    stop is automatically appended after every leg (representing pickup
    or drop-off), matching the assignment's stated assumption.
    """

    state = _SimState(clock=start_datetime, cycle_used=current_cycle_used_hours)
    segments: list[DutySegment] = []
    iterations = 0

    def resolve_blocking_constraint(is_driving: bool, speed_mph: float) -> None:
        """Insert whichever rest/break/fuel event is currently binding."""
        cycle_remaining = MAX_CYCLE_HOURS - state.cycle_used
        window_remaining = MAX_WINDOW_HOURS - state.window_elapsed
        driving_remaining = MAX_DRIVING_HOURS - state.driving_in_window
        break_remaining = MAX_DRIVING_BEFORE_BREAK - state.driving_since_break
        fuel_remaining_miles = FUEL_INTERVAL_MILES - state.distance_since_fuel
        fuel_remaining_hours = (
            fuel_remaining_miles / speed_mph if is_driving and speed_mph > 0 else float("inf")
        )

        # A 34-hour restart also satisfies every shorter reset, so it takes
        # priority whenever the weekly cycle is the binding constraint.
        here_leg, here_fraction = state.last_leg_name, state.last_fraction

        if cycle_remaining <= EPSILON:
            _append(
                DutyStatus.OFF_DUTY,
                RESTART_HOURS,
                "34-hour restart (70-hour/8-day cycle reset)",
                leg_name=here_leg,
                leg_progress_fraction=here_fraction,
            )
            state.cycle_used = 0.0
            state.driving_in_window = 0.0
            state.driving_since_break = 0.0
            state.window_start = state.clock
            return

        if window_remaining <= EPSILON or (is_driving and driving_remaining <= EPSILON):
            _append(
                DutyStatus.OFF_DUTY,
                MIN_OFF_DUTY_RESET,
                "Required 10-hour rest period",
                leg_name=here_leg,
                leg_progress_fraction=here_fraction,
            )
            state.driving_in_window = 0.0
            state.driving_since_break = 0.0
            state.window_start = state.clock
            return

        if is_driving and break_remaining <= EPSILON:
            _append(
                DutyStatus.OFF_DUTY,
                BREAK_DURATION,
                "Required 30-minute break",
                leg_name=here_leg,
                leg_progress_fraction=here_fraction,
            )
            state.driving_since_break = 0.0
            return

        if is_driving and fuel_remaining_hours <= EPSILON:
            _append(
                DutyStatus.ON_DUTY_NOT_DRIVING,
                FUEL_STOP_DURATION,
                "Fuel stop",
                leg_name=here_leg,
                leg_progress_fraction=here_fraction,
            )
            state.distance_since_fuel = 0.0
            state.driving_since_break = 0.0
            return

        # Should never happen: nothing is blocking but capacity was <= 0.
        raise TripTooLongError("Could not resolve a blocking HOS constraint.")

    def _append(status: DutyStatus, hours: float, label: str, leg_name: str | None = None,
                miles: float = 0.0, leg_progress_fraction: float | None = None) -> None:
        nonlocal iterations
        iterations += 1
        if iterations > MAX_ITERATIONS:
            raise TripTooLongError("Trip simulation exceeded maximum iterations.")
        end = state.clock + timedelta(hours=hours)
        segments.append(
            DutySegment(
                status=status,
                start=state.clock,
                end=end,
                label=label,
                leg_name=leg_name,
                miles=miles,
                leg_progress_fraction=leg_progress_fraction,
            )
        )
        state.clock = end
        # Only on-duty time (driving or on-duty-not-driving) counts toward
        # the 60/70-hour cycle limit — off-duty and sleeper-berth time does not.
        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING):
            state.cycle_used += hours

    def drive_leg(leg: RouteLeg) -> None:
        remaining_hours = leg.duration_hours
        speed = leg.avg_speed_mph
        miles_covered = 0.0

        while remaining_hours > EPSILON:
            cycle_remaining = MAX_CYCLE_HOURS - state.cycle_used
            window_remaining = MAX_WINDOW_HOURS - state.window_elapsed
            driving_remaining = MAX_DRIVING_HOURS - state.driving_in_window
            break_remaining = MAX_DRIVING_BEFORE_BREAK - state.driving_since_break
            fuel_remaining_miles = FUEL_INTERVAL_MILES - state.distance_since_fuel
            fuel_remaining_hours = fuel_remaining_miles / speed if speed > 0 else float("inf")

            chunk = min(
                remaining_hours,
                cycle_remaining,
                window_remaining,
                driving_remaining,
                break_remaining,
                fuel_remaining_hours,
            )

            if chunk <= EPSILON:
                resolve_blocking_constraint(is_driving=True, speed_mph=speed)
                continue

            chunk_miles = chunk * speed
            miles_covered += chunk_miles
            fraction = miles_covered / leg.distance_miles if leg.distance_miles > 0 else 1.0

            _append(
                DutyStatus.DRIVING,
                chunk,
                f"Driving — {leg.name}",
                leg_name=leg.name,
                miles=chunk_miles,
                leg_progress_fraction=min(fraction, 1.0),
            )
            state.driving_in_window += chunk
            state.driving_since_break += chunk
            state.distance_since_fuel += chunk_miles
            state.last_leg_name = leg.name
            state.last_fraction = min(fraction, 1.0)
            remaining_hours -= chunk

    def stationary_stop(hours: float, label: str, leg_name: str) -> None:
        remaining_hours = hours
        while remaining_hours > EPSILON:
            cycle_remaining = MAX_CYCLE_HOURS - state.cycle_used
            window_remaining = MAX_WINDOW_HOURS - state.window_elapsed
            chunk = min(remaining_hours, cycle_remaining, window_remaining)

            if chunk <= EPSILON:
                resolve_blocking_constraint(is_driving=False, speed_mph=0.0)
                continue

            _append(
                DutyStatus.ON_DUTY_NOT_DRIVING,
                chunk,
                label,
                leg_name=leg_name,
                leg_progress_fraction=1.0,
            )
            state.last_leg_name = leg_name
            state.last_fraction = 1.0
            if chunk >= BREAK_DURATION - EPSILON:
                state.driving_since_break = 0.0
            remaining_hours -= chunk

    if legs:
        state.last_leg_name = legs[0].name
        state.last_fraction = 0.0

    for leg in legs:
        if leg.distance_miles > 0 and leg.duration_hours > 0:
            drive_leg(leg)
        stop_label = "Pickup — loading (1 hr)" if leg is legs[0] else "Drop-off — unloading (1 hr)"
        stationary_stop(PICKUP_DROPOFF_DURATION, stop_label, leg.name)

    return segments
