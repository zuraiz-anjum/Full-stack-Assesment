"""
Renders a trip's daily logs as a real vector PDF, one page per day, laid
out like the FMCSA "Driver's Daily Log" paper form: a header info block,
the 24-hour / 4-status grid with a stepped duty-status line, a totals
column, a remarks list, and the standard certification statement.

Kept independent of Django/HTTP so it can be unit tested by just handing
it a `result` dict shaped like trip_planner.plan_trip()'s output.
"""

from __future__ import annotations

from datetime import date as date_cls
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = landscape(letter)
MARGIN = 0.5 * inch

ROWS = [
    ("OFF_DUTY", "Off Duty", HexColor("#94a3b8")),
    ("SLEEPER_BERTH", "Sleeper Berth", HexColor("#6d5ce8")),
    ("DRIVING", "Driving", HexColor("#16a34a")),
    ("ON_DUTY_NOT_DRIVING", "On Duty (Not Driving)", HexColor("#dd8b0a")),
]
ROW_INDEX = {key: i for i, (key, _, _) in enumerate(ROWS)}

GRID_LEFT = MARGIN + 1.5 * inch
GRID_TOP_OFFSET = 2.2 * inch  # distance from top margin down to the grid (3 rows of header fields)
ROW_HEIGHT = 0.42 * inch
GRID_HEIGHT = ROW_HEIGHT * len(ROWS)
GRID_WIDTH = PAGE_WIDTH - GRID_LEFT - MARGIN - 0.8 * inch  # leave room for totals col
HOUR_WIDTH = GRID_WIDTH / 24
INK = HexColor("#101a2c")
GRID_LINE = HexColor("#334467")
FAINT = HexColor("#cbd6e8")
MUTED = HexColor("#556080")


def _x(hour: float) -> float:
    return GRID_LEFT + hour * HOUR_WIDTH


def _truncate_to_width(c: canvas.Canvas, text: str, max_width: float, font: str, size: float) -> str:
    if c.stringWidth(text, font, size) <= max_width:
        return text
    ellipsis = "…"
    while text and c.stringWidth(text + ellipsis, font, size) > max_width:
        text = text[:-1]
    return text + ellipsis if text else ellipsis


def _hour_label(h: int) -> str:
    if h == 0:
        return "Mid\nNight"
    if h == 12:
        return "Noon"
    return str(h if h <= 12 else h - 12)


def _format_clock(hour_float: float) -> str:
    h = int(hour_float) % 24
    m = round((hour_float - int(hour_float)) * 60)
    if m == 60:
        m = 0
        h = (h + 1) % 24
    period = "AM" if h < 12 else "PM"
    h12 = 12 if h % 12 == 0 else h % 12
    return f"{h12}:{m:02d} {period}"


def _from_to(log: dict) -> tuple[str, str]:
    """Where the driver was at the start vs. end of this 24-hour period,
    the way the paper form's "From" / "To" boxes work -- approximated from
    the day's remarks, since that's the only per-day location data we have."""
    remarks = log.get("remarks") or []
    located = [r for r in remarks if r.get("location_label")]
    if not located:
        return "—", "—"
    return located[0]["location_label"], located[-1]["location_label"]


def _draw_header(c: canvas.Canvas, top_y: float, log: dict, vehicle_info: dict, day_total: int) -> None:
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(INK)
    c.drawString(MARGIN, top_y, "Driver's Daily Log")

    log_date = date_cls.fromisoformat(log["date"])
    c.setFont("Helvetica", 10)
    c.drawString(
        MARGIN,
        top_y - 16,
        f"Day {log['day_index']} of {day_total} — {log_date.strftime('%A, %B %d, %Y')}",
    )
    c.drawRightString(
        PAGE_WIDTH - MARGIN, top_y, "24-hour period starting time: Midnight"
    )

    from_loc, to_loc = _from_to(log)
    fields = [
        ("Date", log_date.strftime("%m/%d/%Y")),
        ("From", from_loc),
        ("To", to_loc),
        ("Total miles driving today", f"{log.get('total_miles', 0):.1f} mi"),
        ("Carrier", vehicle_info.get("carrier_name") or ""),
        ("Main office address", vehicle_info.get("main_office_address") or ""),
        ("Truck / trailer no.", " / ".join(filter(None, [vehicle_info.get("truck_number"), vehicle_info.get("trailer_number")]))),
        ("Shipping doc # / shipper & commodity", vehicle_info.get("shipping_doc_number") or ""),
        ("Driver", vehicle_info.get("driver_name") or ""),
        ("Co-driver", vehicle_info.get("co_driver_name") or ""),
    ]

    col_width = (PAGE_WIDTH - 2 * MARGIN) / 4
    row_y = top_y - 44
    for i, (label, value) in enumerate(fields):
        col = i % 4
        row = i // 4
        x = MARGIN + col * col_width
        y = row_y - row * 30
        available = col_width - 12
        c.setFont("Helvetica", 7)
        c.setFillColor(MUTED)
        c.drawString(x, y, _truncate_to_width(c, label.upper(), available, "Helvetica", 7))
        c.setFont("Helvetica", 9.5)
        c.setFillColor(INK)
        c.drawString(x, y - 12, _truncate_to_width(c, value or "—", available, "Helvetica", 9.5))
        c.setStrokeColor(FAINT)
        c.line(x, y - 15, x + available, y - 15)


def _draw_grid(c: canvas.Canvas, grid_top: float, log: dict) -> None:
    totals = log.get("totals", {})

    # Hour labels + gridlines
    c.setFont("Helvetica", 6.5)
    for h in range(25):
        x = _x(h if h < 24 else 24)
        label = _hour_label(h % 24) if h < 24 else "Mid\nNight"
        c.setFillColor(MUTED)
        for li, line in enumerate(label.split("\n")):
            c.drawCentredString(x, grid_top + 6 + (1 - li) * 7, line)

    for i in range(97):
        hour = i / 4
        x = _x(hour)
        is_hour = i % 4 == 0
        is_boundary = i % 96 == 0
        c.setStrokeColor(GRID_LINE if is_boundary else (FAINT if not is_hour else HexColor("#a3b3cf")))
        c.setLineWidth(1.4 if is_boundary else (1 if is_hour else 0.4))
        c.line(x, grid_top, x, grid_top - GRID_HEIGHT)

    # Row bands, labels, totals
    for i, (key, label, color) in enumerate(ROWS):
        row_top = grid_top - i * ROW_HEIGHT
        if i % 2 == 0:
            c.setFillColor(HexColor("#f9fafc"))
            c.rect(GRID_LEFT, row_top - ROW_HEIGHT, GRID_WIDTH, ROW_HEIGHT, stroke=0, fill=1)
        c.setStrokeColor(FAINT)
        c.setLineWidth(1)
        c.line(GRID_LEFT, row_top, GRID_LEFT + GRID_WIDTH, row_top)

        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INK)
        c.drawRightString(GRID_LEFT - 8, row_top - ROW_HEIGHT / 2 - 3, label)

        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(color)
        c.drawString(GRID_LEFT + GRID_WIDTH + 10, row_top - ROW_HEIGHT / 2 - 3, f"{totals.get(key, 0):.2f} h")

    c.setStrokeColor(GRID_LINE)
    c.setLineWidth(1.4)
    c.rect(GRID_LEFT, grid_top - GRID_HEIGHT, GRID_WIDTH, GRID_HEIGHT, stroke=1, fill=0)

    # Shaded status bands + the bold stepped duty-status line
    blocks = log.get("blocks", [])
    for block in blocks:
        row_i = ROW_INDEX[block["status"]]
        color = ROWS[row_i][2]
        x0 = _x(block["start_hour"])
        x1 = _x(block["end_hour"])
        y_mid = grid_top - row_i * ROW_HEIGHT - ROW_HEIGHT / 2
        c.setFillColor(color)
        c.setFillAlpha(0.22)
        c.rect(x0, y_mid - 4, max(x1 - x0, 0), 8, stroke=0, fill=1)
    c.setFillAlpha(1)

    if blocks:
        c.setStrokeColor(INK)
        c.setLineWidth(1.8)
        path = c.beginPath()
        first = blocks[0]
        path.moveTo(_x(first["start_hour"]), grid_top - ROW_INDEX[first["status"]] * ROW_HEIGHT - ROW_HEIGHT / 2)
        for block in blocks:
            y = grid_top - ROW_INDEX[block["status"]] * ROW_HEIGHT - ROW_HEIGHT / 2
            path.lineTo(_x(block["start_hour"]), y)
            path.lineTo(_x(block["end_hour"]), y)
        c.drawPath(path, stroke=1, fill=0)

    total_hours = sum(totals.get(key, 0) for key, _, _ in ROWS)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(INK if abs(total_hours - 24.0) < 0.05 else HexColor("#dc2626"))
    c.drawString(
        GRID_LEFT + GRID_WIDTH + 10,
        grid_top - GRID_HEIGHT - 14,
        f"Total: {total_hours:.2f} h",
    )


def _draw_remarks(c: canvas.Canvas, top: float, log: dict) -> float:
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(INK)
    c.drawString(MARGIN, top, "REMARKS")
    y = top - 13
    c.setFont("Helvetica", 8)
    for r in log.get("remarks", []):
        line = f"{_format_clock(r['hour'])}  —  {r.get('location_label') or r.get('activity_label', '')}"
        if r.get("location_label") and r.get("activity_label"):
            line = f"{_format_clock(r['hour'])}  —  {r['activity_label']}  ({r['location_label']})"
        c.setFillColor(MUTED)
        c.drawString(MARGIN, y, _truncate_to_width(c, line, PAGE_WIDTH - 2 * MARGIN, "Helvetica", 8))
        y -= 11
    return y


def _draw_certification(c: canvas.Canvas, y: float, vehicle_info: dict) -> None:
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(MUTED)
    c.drawString(
        MARGIN,
        y,
        "I hereby certify that the entries in this record of duty status are true and correct.",
    )
    c.setStrokeColor(FAINT)
    c.line(MARGIN, y - 18, MARGIN + 2.4 * inch, y - 18)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN, y - 27, vehicle_info.get("driver_name") or "Driver signature")


def build_trip_pdf(result: dict) -> bytes:
    """Render every daily log in `result` (trip_planner's output shape) as
    one landscape page each and return the PDF file bytes."""

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))
    vehicle_info = result.get("vehicle_info", {})
    daily_logs = result.get("daily_logs", [])

    for log in daily_logs:
        top_y = PAGE_HEIGHT - MARGIN - 6
        _draw_header(c, top_y, log, vehicle_info, len(daily_logs))
        grid_top = PAGE_HEIGHT - MARGIN - GRID_TOP_OFFSET
        _draw_grid(c, grid_top, log)
        remarks_end_y = _draw_remarks(c, grid_top - GRID_HEIGHT - 34, log)
        _draw_certification(c, min(remarks_end_y - 12, MARGIN + 40), vehicle_info)

        c.setFont("Helvetica", 7)
        c.setFillColor(MUTED)
        c.drawRightString(PAGE_WIDTH - MARGIN, MARGIN - 10, "Generated by RouteLog — FMCSA property-carrier HOS ruleset (49 CFR Part 395)")

        c.showPage()

    c.save()
    return buf.getvalue()
