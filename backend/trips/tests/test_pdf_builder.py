from unittest import TestCase

from trips.services.pdf_builder import _from_to, build_trip_pdf

BASE_RESULT = {
    "vehicle_info": {
        "carrier_name": "Acme Freight LLC",
        "main_office_address": "1 Main St, Chicago, IL",
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


class FromToTests(TestCase):
    def test_uses_first_and_last_located_remark(self):
        log = BASE_RESULT["daily_logs"][0]
        self.assertEqual(_from_to(log), ("Chicago, IL, USA", "Indianapolis, IN, USA"))

    def test_single_remark_is_both_from_and_to(self):
        log = {"remarks": [{"hour": 5.0, "location_label": "Nashville, TN, USA"}]}
        self.assertEqual(_from_to(log), ("Nashville, TN, USA", "Nashville, TN, USA"))

    def test_no_located_remarks_falls_back_to_dashes(self):
        self.assertEqual(_from_to({"remarks": []}), ("—", "—"))
        self.assertEqual(_from_to({}), ("—", "—"))
        self.assertEqual(
            _from_to({"remarks": [{"hour": 1.0, "activity_label": "no location on this one"}]}),
            ("—", "—"),
        )
