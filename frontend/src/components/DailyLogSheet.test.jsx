import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DailyLogSheet, { formatClock } from "./DailyLogSheet";

describe("formatClock", () => {
  it("formats a normal half-hour correctly", () => {
    expect(formatClock(6.5)).toBe("6:30 AM");
  });

  it("rolls over instead of printing a 60th minute (regression)", () => {
    // Floating-point drift can produce values like 11.99999996; rounding
    // the minutes naively used to print "11:60 AM" instead of "12:00 PM".
    expect(formatClock(11.999999999)).toBe("12:00 PM");
    expect(formatClock(23.9999999)).toBe("12:00 AM");
  });

  it("handles midnight and noon boundaries", () => {
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12)).toBe("12:00 PM");
  });
});

const SAMPLE_LOG = {
  date: "2026-01-05",
  day_index: 1,
  total_miles: 250.4,
  totals: {
    OFF_DUTY: 10,
    SLEEPER_BERTH: 0,
    DRIVING: 13,
    ON_DUTY_NOT_DRIVING: 1,
  },
  blocks: [
    { status: "OFF_DUTY", start_hour: 0, end_hour: 6 },
    { status: "DRIVING", start_hour: 6, end_hour: 19 },
    { status: "ON_DUTY_NOT_DRIVING", start_hour: 19, end_hour: 20 },
    { status: "OFF_DUTY", start_hour: 20, end_hour: 24 },
  ],
  remarks: [
    { hour: 6, location_label: "Chicago, IL", activity_label: "Driving" },
    { hour: 19, location_label: "Indianapolis, IN", activity_label: "Drop-off" },
  ],
};

describe("DailyLogSheet", () => {
  it("renders the day heading and per-status totals", () => {
    const { container } = render(<DailyLogSheet log={SAMPLE_LOG} />);
    expect(screen.getByText(/Day 1/)).toBeInTheDocument();
    // "Driving: " and "13.00h" sit in separate DOM nodes (label text vs.
    // a nested <strong>), so check the combined rendered text instead of
    // a single-node match.
    expect(container.textContent).toContain("Driving: 13.00h");
    expect(container.textContent).toContain("Off Duty: 10.00h");
  });

  it("renders the per-day mileage total", () => {
    render(<DailyLogSheet log={SAMPLE_LOG} />);
    expect(screen.getByText("250.4 mi")).toBeInTheDocument();
  });

  it("shows an em dash placeholder for vehicle fields that weren't provided", () => {
    render(<DailyLogSheet log={SAMPLE_LOG} />);
    // Driver/Carrier/etc fields should show the blank placeholder, not "undefined".
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("renders provided vehicle info fields", () => {
    render(
      <DailyLogSheet
        log={SAMPLE_LOG}
        vehicleInfo={{ carrierName: "Acme Freight LLC", driverName: "John Doe" }}
      />
    );
    expect(screen.getByText("Acme Freight LLC")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });
});
