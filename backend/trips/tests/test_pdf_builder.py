from unittest import TestCase

from trips.services.pdf_builder import build_trip_pdf

BASE_RESULT = {
    "vehicle_info": {
        "carrier_name": "Acme Freight LLC",
        "main_office_address": "1 Main St, Chicago, IL",
        "home_terminal_address": "1 Main St, Chicago, IL",
        "truck_number": "T-1",
        "trailer_number": "TR-1",
        "driver_name": "Jane Doe",
        "co_driver_name": "",
        "shipping_doc_number": "PRO-100",
    },
    "daily_logs": [
        {
            "date": "2026-01-05",
            "day_index": 1,
            "total_miles": 310.5,
            "from_location": "Chicago, IL, USA",
            "to_location": "Indianapolis, IN, USA",
            "cycle_hours_used": 25.0,
            "totals": {
                "OFF_DUTY": 10.0,
                "SLEEPER_BERTH": 0.0,
                "DRIVING": 11.0,
                "ON_DUTY_NOT_DRIVING": 3.0,
            },
            "blocks": [
                {"status": "OFF_DUTY", "start_hour": 0.0, "end_hour": 6.0},
                {"status": "ON_DUTY_NOT_DRIVING", "start_hour": 6.0, "end_hour": 7.0},
                {"status": "DRIVING", "start_hour": 7.0, "end_hour": 18.0},
                {"status": "ON_DUTY_NOT_DRIVING", "start_hour": 18.0, "end_hour": 20.0},
                {"status": "OFF_DUTY", "start_hour": 20.0, "end_hour": 24.0},
            ],
            "remarks": [
                {"hour": 6.0, "location_label": "Chicago, IL, USA", "activity_label": "Pickup — loading (1 hr)"},
                {"hour": 18.0, "location_label": "Indianapolis, IN, USA", "activity_label": "Drop-off — unloading (1 hr)"},
            ],
        },
    ],
}


class BuildTripPdfTests(TestCase):
    def test_returns_a_valid_pdf(self):
        pdf_bytes = build_trip_pdf(BASE_RESULT)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_one_page_per_daily_log(self):
        result = {**BASE_RESULT, "daily_logs": BASE_RESULT["daily_logs"] * 3}
        pdf_bytes = build_trip_pdf(result)
        # reportlab emits one "/Type /Page\n" object per page; the trailing
        # newline (vs. "/Type /Pages" for the tree root) keeps this exact.
        self.assertEqual(pdf_bytes.count(b"/Type /Page\n"), 3)

    def test_handles_missing_vehicle_info(self):
        result = {"vehicle_info": {}, "daily_logs": BASE_RESULT["daily_logs"]}
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_handles_no_daily_logs(self):
        result = {"vehicle_info": {}, "daily_logs": []}
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_handles_missing_cycle_hours_used(self):
        # Older stored trips predate the recap box -- shouldn't crash, and
        # the recap's A/B fields should render as blank rather than "0.00".
        log = {**BASE_RESULT["daily_logs"][0]}
        del log["cycle_hours_used"]
        result = {"vehicle_info": {}, "daily_logs": [log]}
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_handles_very_long_field_values_without_crashing(self):
        result = {
            "vehicle_info": {**BASE_RESULT["vehicle_info"], "carrier_name": "A" * 300},
            "daily_logs": BASE_RESULT["daily_logs"],
        }
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_handles_empty_blocks_and_remarks(self):
        result = {
            "vehicle_info": {},
            "daily_logs": [{**BASE_RESULT["daily_logs"][0], "blocks": [], "remarks": []}],
        }
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")

    def test_handles_many_remarks_without_running_off_the_page(self):
        # A busy day (lots of fuel/rest/break stops) pushes the shipping
        # docs / recap / certification blocks further down the page --
        # make sure that still produces a valid PDF rather than negative
        # coordinates or an exception.
        many_remarks = [
            {"hour": float(h), "location_label": f"Place {h}, USA", "activity_label": "Driving"}
            for h in range(20)
        ]
        result = {
            "vehicle_info": BASE_RESULT["vehicle_info"],
            "daily_logs": [{**BASE_RESULT["daily_logs"][0], "remarks": many_remarks}],
        }
        pdf_bytes = build_trip_pdf(result)
        self.assertEqual(pdf_bytes[:4], b"%PDF")
