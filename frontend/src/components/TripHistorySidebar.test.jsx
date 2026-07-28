import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TripHistorySidebar from "./TripHistorySidebar";

const TRIPS = [
  { id: 1, pickup_location: "Indianapolis, IN", dropoff_location: "Nashville, TN", created_at: "2026-01-05T08:00:00Z" },
  { id: 2, pickup_location: "Chicago, IL", dropoff_location: "Detroit, MI", created_at: "2026-01-06T08:00:00Z" },
];

describe("TripHistorySidebar", () => {
  it("calls onSelect with the trip id when a row is clicked", async () => {
    const onSelect = vi.fn();
    render(<TripHistorySidebar trips={TRIPS} onSelect={onSelect} loading={false} />);
    await userEvent.click(screen.getByText(/Indianapolis, IN/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("disables every trip row while a new trip is being planned", () => {
    // A trip submission in flight will eventually call setTrip(created) --
    // picking a different trip mid-submission would just get silently
    // overwritten once that resolves, so the whole list is disabled rather
    // than letting the user start an interaction that's going to lose a race.
    render(<TripHistorySidebar trips={TRIPS} onSelect={() => {}} loading={false} disabled />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("does not disable rows when not submitting", () => {
    render(<TripHistorySidebar trips={TRIPS} onSelect={() => {}} loading={false} disabled={false} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toBeDisabled();
    }
  });
});
