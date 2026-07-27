"""
Resolves an approximate IANA timezone for a US coordinate, purely from
longitude (and a couple of latitude checks for Alaska/Hawaii). This is a
deliberate simplification — real timezone boundaries follow state/county
lines, not longitude — but it's dependency-free (uses the stdlib `zoneinfo`
plus the `tzdata` package Django already pulls in) and is accurate enough
to pick the right timezone for the vast majority of US locations, which is
what actually matters here: HOS clocks must run on the driver's local wall
time, not the server's, and being off by a timezone at a state border is a
far smaller problem than ignoring timezones entirely.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

UTC = ZoneInfo("UTC")


def resolve_us_timezone(lat: float, lon: float) -> ZoneInfo:
    if lat < 25 and lon < -150:
        return ZoneInfo("Pacific/Honolulu")
    if lat > 51 and lon < -130:
        return ZoneInfo("America/Anchorage")
    if lon > -87:
        return ZoneInfo("America/New_York")
    if lon > -102:
        return ZoneInfo("America/Chicago")
    if lon > -115:
        return ZoneInfo("America/Denver")
    return ZoneInfo("America/Los_Angeles")


def local_wall_clock_now(lat: float, lon: float) -> tuple[datetime, str]:
    """
    Returns (naive local wall-clock datetime, IANA zone name) for "now" at
    the given coordinate. Naive on purpose — the HOS engine does plain
    wall-clock arithmetic, which is what the regulations actually count
    (a duty day is still "24 wall-clock hours" through a DST transition).
    """
    zone = resolve_us_timezone(lat, lon)
    aware_now = datetime.now(UTC).astimezone(zone)
    return aware_now.replace(tzinfo=None), str(zone)
