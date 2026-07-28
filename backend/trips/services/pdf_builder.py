"""
Renders a trip's daily logs as a real vector PDF, one page per day, laid
out to match the standard FMCSA "Driver's Daily Log" paper form field-for-
field (From/To, carrier/office/terminal info, the numbered 4-row duty
grid, shipping documents, and the 70-hour/8-day recap box) -- this is the
document that actually gets downloaded and handed in, so it's built to
read as that form, not as a branded app export.

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
MARGIN = 0.45 * inch

# Row labels are numbered on the real form -- "3. Driving" not just
# "Driving" -- since that numbering is what the remarks/recap sections
# below refer back to ("Total lines 3 & 4").
ROWS = [
    ("OFF_DUTY", "1. Off Duty"),
    ("SLEEPER_BERTH", "2. Sleeper Berth"),
    ("DRIVING", "3. Driving"),
    ("ON_DUTY_NOT_DRIVING", "4. On Duty\n(Not Driving)"),
]
ROW_INDEX = {key: i for i, (key, _) in enumerate(ROWS)}

GRID_LEFT = MARGIN + 1.3 * inch
HEADER_HEIGHT = 2.2 * inch
ROW_HEIGHT = 0.34 * inch
GRID_HEIGHT = ROW_HEIGHT * len(ROWS)
GRID_WIDTH = PAGE_WIDTH - GRID_LEFT - MARGIN - 0.55 * inch  # leave room for the totals column
HOUR_WIDTH = GRID_WIDTH / 24

# A monochrome document, deliberately -- this is printed and handed to a
# safety inspector, not viewed in the app, so it reads as the real black-
# and-white paper form rather than a colored product export. The only
# thing distinguishing a duty status is which grid row it's on, same as
# the paper original.
INK = HexColor("#000000")
GRID_LINE = HexColor("#000000")
FAINT = HexColor("#888888")
MUTED = HexColor("#444444")
ZEBRA = HexColor("#f2f2f2")


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


def _field(c: canvas.Canvas, x: float, y: float, width: float, label: str, value: str) -> None:
    """One underlined write-in field: value on the line, label printed
    beneath it in small caps -- the same convention the paper form uses
    throughout (as opposed to a label-above-value "form field" look)."""
    c.setFont("Helvetica", 9)
    c.setFillColor(INK)
    c.drawString(x, y, _truncate_to_width(c, value or "", width, "Helvetica", 9))
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(x, y - 3, x + width, y - 3)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(MUTED)
    c.drawString(x, y - 12, label)


def _draw_header(c: canvas.Canvas, top_y: float, log: dict, vehicle_info: dict, day_total: int) -> None:
    log_date = date_cls.fromisoformat(log["date"])

    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(INK)
    c.drawString(MARGIN, top_y, "Driver's Daily Log")
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, top_y - 12, "(24 hours)")
    c.drawString(
        MARGIN, top_y - 24,
        f"Day {log['day_index']} of {day_total} — {log_date.strftime('%A, %B %d, %Y')}",
    )

    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_WIDTH - MARGIN, top_y - 2, "Original — File at home terminal")
    c.drawRightString(PAGE_WIDTH - MARGIN, top_y - 11, "Duplicate — Driver retains in his/her possession for 8 days")
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(INK)
    c.drawRightString(
        PAGE_WIDTH - MARGIN, top_y - 26,
        f"{log_date.month:02d} / {log_date.day:02d} / {log_date.year}   (month / day / year)",
    )

    from_to_y = top_y - 42
    half = (PAGE_WIDTH - 2 * MARGIN - 20) / 2
    _field(c, MARGIN, from_to_y, half, "FROM", log.get("from_location") or "")
    _field(c, MARGIN + half + 20, from_to_y, half, "TO", log.get("to_location") or "")

    row_y = from_to_y - 26
    col_width = (PAGE_WIDTH - 2 * MARGIN) / 4
    gap = 10
    row1 = [
        ("TOTAL MILES DRIVING TODAY", f"{log.get('total_miles', 0):.1f} mi"),
        ("TOTAL MILEAGE TODAY", f"{log.get('total_miles', 0):.1f} mi"),
        ("NAME OF CARRIER OR CARRIERS", vehicle_info.get("carrier_name") or ""),
    ]
    for i, (label, value) in enumerate(row1):
        _field(c, MARGIN + i * col_width, row_y, col_width - gap, label, value)

    row_y -= 26
    truck_trailer = " / ".join(
        filter(None, [vehicle_info.get("truck_number"), vehicle_info.get("trailer_number")])
    )
    row2 = [
        ("TRUCK/TRACTOR AND TRAILER NUMBER(S) OR LICENSE PLATE(S)/STATE", truck_trailer, 2),
        ("MAIN OFFICE ADDRESS", vehicle_info.get("main_office_address") or "", 1),
    ]
    x = MARGIN
    for label, value, span in row2:
        w = col_width * span - gap
        _field(c, x, row_y, w, label, value)
        x += col_width * span

    row_y -= 26
    row3 = [
        ("HOME TERMINAL ADDRESS", vehicle_info.get("home_terminal_address") or ""),
        ("DRIVER", vehicle_info.get("driver_name") or ""),
        ("CO-DRIVER", vehicle_info.get("co_driver_name") or ""),
    ]
    for i, (label, value) in enumerate(row3):
        _field(c, MARGIN + i * col_width, row_y, col_width - gap, label, value)


def _draw_grid(c: canvas.Canvas, grid_top: float, log: dict) -> None:
    totals = log.get("totals", {})

    c.setFont("Helvetica", 6)
    for h in range(25):
        x = _x(h if h < 24 else 24)
        label = _hour_label(h % 24) if h < 24 else "Mid\nNight"
        c.setFillColor(MUTED)
        for li, line in enumerate(label.split("\n")):
            c.drawCentredString(x, grid_top + 5 + (1 - li) * 6.5, line)
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(INK)
    c.drawCentredString(GRID_LEFT + GRID_WIDTH + 0.32 * inch, grid_top + 5, "Total")
    c.drawCentredString(GRID_LEFT + GRID_WIDTH + 0.32 * inch, grid_top - 3, "Hours")

    for i in range(97):
        hour = i / 4
        x = _x(hour)
        is_hour = i % 4 == 0
        is_boundary = i % 96 == 0
        c.setStrokeColor(GRID_LINE if is_boundary else (FAINT if not is_hour else HexColor("#555555")))
        c.setLineWidth(1.2 if is_boundary else (0.8 if is_hour else 0.3))
        c.line(x, grid_top, x, grid_top - GRID_HEIGHT)

    for i, (key, label) in enumerate(ROWS):
        row_top = grid_top - i * ROW_HEIGHT
        if i % 2 == 0:
            c.setFillColor(ZEBRA)
            c.rect(GRID_LEFT, row_top - ROW_HEIGHT, GRID_WIDTH, ROW_HEIGHT, stroke=0, fill=1)
        c.setStrokeColor(FAINT)
        c.setLineWidth(0.6)
        c.line(GRID_LEFT, row_top, GRID_LEFT + GRID_WIDTH, row_top)

        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(INK)
        lines = label.split("\n")
        base_y = row_top - ROW_HEIGHT / 2 - 3 + (len(lines) - 1) * 4
        for li, line in enumerate(lines):
            c.drawRightString(GRID_LEFT - 6, base_y - li * 8, line)

        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INK)
        c.drawCentredString(
            GRID_LEFT + GRID_WIDTH + 0.32 * inch, row_top - ROW_HEIGHT / 2 - 3, f"{totals.get(key, 0):.2f}"
        )

    c.setStrokeColor(GRID_LINE)
    c.setLineWidth(1.2)
    c.rect(GRID_LEFT, grid_top - GRID_HEIGHT, GRID_WIDTH, GRID_HEIGHT, stroke=1, fill=0)

    blocks = log.get("blocks", [])
    if blocks:
        c.setStrokeColor(INK)
        c.setLineWidth(1.6)
        path = c.beginPath()
        first = blocks[0]
        path.moveTo(_x(first["start_hour"]), grid_top - ROW_INDEX[first["status"]] * ROW_HEIGHT - ROW_HEIGHT / 2)
        for block in blocks:
            y = grid_top - ROW_INDEX[block["status"]] * ROW_HEIGHT - ROW_HEIGHT / 2
            path.lineTo(_x(block["start_hour"]), y)
            path.lineTo(_x(block["end_hour"]), y)
        c.drawPath(path, stroke=1, fill=0)

    total_hours = sum(totals.get(key, 0) for key, _ in ROWS)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(INK if abs(total_hours - 24.0) < 0.05 else HexColor("#dc2626"))
    c.drawCentredString(
        GRID_LEFT + GRID_WIDTH + 0.32 * inch,
        grid_top - GRID_HEIGHT - 13,
        f"= {total_hours:.2f}",
    )


def _draw_remarks(c: canvas.Canvas, top: float, log: dict) -> float:
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(INK)
    c.drawString(MARGIN, top, "REMARKS")
    y = top - 11
    c.setFont("Helvetica", 7.5)
    for r in log.get("remarks", []):
        line = f"{_format_clock(r['hour'])}  —  {r.get('location_label') or r.get('activity_label', '')}"
        if r.get("location_label") and r.get("activity_label"):
            line = f"{_format_clock(r['hour'])}  —  {r['activity_label']}  ({r['location_label']})"
        c.setFillColor(MUTED)
        c.drawString(MARGIN, y, _truncate_to_width(c, line, PAGE_WIDTH - 2 * MARGIN, "Helvetica", 7.5))
        y -= 10
    return y


def _draw_shipping_docs(c: canvas.Canvas, top: float, vehicle_info: dict) -> None:
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(INK)
    c.drawString(MARGIN, top, "SHIPPING DOCUMENTS")
    c.setFont("Helvetica", 6.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, top - 10, "DVL or Manifest No., or Shipper & Commodity:")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawString(
        MARGIN + 1.9 * inch, top - 10,
        _truncate_to_width(c, vehicle_info.get("shipping_doc_number") or "—", 3.2 * inch, "Helvetica", 8.5),
    )
    c.setFont("Helvetica-Oblique", 6)
    c.setFillColor(FAINT)
    c.drawString(
        MARGIN, top - 22,
        "Enter name of place you reported and where released from work, and when and where each change of duty occurred. "
        "Use time standard of home terminal.",
    )


RECAP_COL_WIDTH = 1.55 * inch
RECAP_WRAP_CHARS = 22


def _recap_field(c: canvas.Canvas, x: float, y: float, label: str, value: str | None) -> None:
    c.setFont("Helvetica", 6.5)
    c.setFillColor(MUTED)
    for li, line in enumerate(_wrap(label, RECAP_WRAP_CHARS)):
        c.drawString(x, y - li * 7.5, line)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK if value is not None else FAINT)
    c.drawRightString(x + RECAP_COL_WIDTH, y + 2, value if value is not None else "—")


def _wrap(text: str, max_chars: int) -> list[str]:
    words = text.split()
    lines, current = [], ""
    for w in words:
        candidate = f"{current} {w}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = w
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _draw_recap(c: canvas.Canvas, top: float, log: dict) -> None:
    """The 70-hour/8-day recap box every printed log sheet has. Only the
    cycle this app actually simulates (70hr/8day, per the assignment's
    stated property-carrier assumption) gets real numbers -- the 60hr/7day
    column is left blank with just its labels, exactly as a driver whose
    carrier doesn't use that cycle would leave it on the real form, rather
    than fabricating a number for a limit this app doesn't enforce."""
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(INK)
    c.drawString(MARGIN, top, "RECAP — COMPLETE AT END OF DAY")

    on_duty_today = log.get("totals", {}).get("DRIVING", 0) + log.get("totals", {}).get("ON_DUTY_NOT_DRIVING", 0)
    cycle_used = log.get("cycle_hours_used")
    hours_available = max(0.0, 70.0 - cycle_used) if cycle_used is not None else None

    on_duty_col = 1.5 * inch
    inner_gap = 0.15 * inch
    group_gap = 0.35 * inch
    # Column-group headers ("70-HOUR / 8-DAY DRIVERS" etc.) get their own
    # row below the section title -- they used to share a row with it and
    # collided, since the title text alone runs past where the first
    # column group starts.
    group_header_y = top - 12
    row_y = group_header_y - 16

    _recap_field(c, MARGIN, row_y, "On duty hours today (lines 3+4)", f"{on_duty_today:.2f}")

    x_70a = MARGIN + on_duty_col + 0.25 * inch
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(INK)
    c.drawString(x_70a, group_header_y, "70-HOUR / 8-DAY DRIVERS")
    _recap_field(c, x_70a, row_y, "A. On duty, last 8 days incl. today", f"{cycle_used:.2f}" if cycle_used is not None else None)
    x_70b = x_70a + RECAP_COL_WIDTH + inner_gap
    _recap_field(c, x_70b, row_y, "B. Available tomorrow (70 − A)", f"{hours_available:.2f}" if hours_available is not None else None)

    x_60a = x_70b + RECAP_COL_WIDTH + group_gap
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(FAINT)
    c.drawString(x_60a, group_header_y, "60-HOUR / 7-DAY DRIVERS")
    _recap_field(c, x_60a, row_y, "A. On duty, last 7 days incl. today", None)
    x_60b = x_60a + RECAP_COL_WIDTH + inner_gap
    _recap_field(c, x_60b, row_y, "B. Available tomorrow (60 − A)", None)


def _draw_certification(c: canvas.Canvas, y: float, vehicle_info: dict) -> None:
    c.setFont("Helvetica-Oblique", 7)
    c.setFillColor(MUTED)
    c.drawString(
        MARGIN,
        y,
        "I hereby certify that the entries in this record of duty status are true and correct.",
    )
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(MARGIN, y - 16, MARGIN + 2.4 * inch, y - 16)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, y - 24, vehicle_info.get("driver_name") or "Driver signature")


def build_trip_pdf(result: dict) -> bytes:
    """Render every daily log in `result` (trip_planner's output shape) as
    one landscape page each and return the PDF file bytes."""

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))
    vehicle_info = result.get("vehicle_info", {})
    daily_logs = result.get("daily_logs", [])

    for log in daily_logs:
        top_y = PAGE_HEIGHT - MARGIN - 4
        _draw_header(c, top_y, log, vehicle_info, len(daily_logs))
        grid_top = top_y - HEADER_HEIGHT
        _draw_grid(c, grid_top, log)

        remarks_top = grid_top - GRID_HEIGHT - 22
        remarks_end_y = _draw_remarks(c, remarks_top, log)

        shipping_top = min(remarks_end_y - 14, remarks_top - 0.9 * inch)
        _draw_shipping_docs(c, shipping_top, vehicle_info)

        recap_top = shipping_top - 34
        _draw_recap(c, recap_top, log)

        # The recap's field labels can wrap onto a second line, and the
        # group headers sit on their own row above that, so this needs
        # real clearance or the certification line prints on top of it.
        _draw_certification(c, recap_top - 52, vehicle_info)

        c.setFont("Helvetica", 6.5)
        c.setFillColor(FAINT)
        c.drawRightString(PAGE_WIDTH - MARGIN, MARGIN - 8, "Generated by RouteLog — FMCSA property-carrier HOS ruleset (49 CFR Part 395)")

        c.showPage()

    c.save()
    return buf.getvalue()
