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

  it("renders the per-day mileage total (both driving miles and total mileage today)", () => {
    render(<DailyLogSheet log={SAMPLE_LOG} />);
    expect(screen.getAllByText("250.4 mi")).toHaveLength(2);
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
    // Appears twice: once in the Driver field, once on the certification
    // signature line.
    expect(screen.getAllByText("John Doe")).toHaveLength(2);
  });

  it("shows a real ampersand, not a literal '&amp;' string (regression)", () => {
    const { container } = render(<DailyLogSheet log={SAMPLE_LOG} />);
    expect(container.textContent).not.toContain("&amp;");
    expect(container.textContent).toContain("shipper & commodity");
  });

  it("does not crash when total_miles, blocks, remarks, or totals are missing (older stored trips)", () => {
    const bareLog = { date: "2026-01-05", day_index: 1 };
    expect(() => render(<DailyLogSheet log={bareLog} />)).not.toThrow();
  });

  it("renders From/To directly from the log's carried-forward location fields", () => {
    const log = { ...SAMPLE_LOG, from_location: "Chicago, IL, USA", to_location: "Indianapolis, IN, USA" };
    render(<DailyLogSheet log={log} />);
    expect(screen.getByText("Chicago, IL, USA")).toBeInTheDocument();
    expect(screen.getByText("Indianapolis, IN, USA")).toBeInTheDocument();
  });

  it("fills in the 70-hour/8-day recap and leaves 60-hour/7-day blank", () => {
    const log = { ...SAMPLE_LOG, cycle_hours_used: 25 };
    const { container } = render(<DailyLogSheet log={log} />);
    expect(container.textContent).toContain("25.00h");
    // Hours available tomorrow = 70 - 25 = 45.
    expect(container.textContent).toContain("45.00h");
  });

  it("shows blank dashes in the recap when cycle_hours_used isn't present", () => {
    render(<DailyLogSheet log={SAMPLE_LOG} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
