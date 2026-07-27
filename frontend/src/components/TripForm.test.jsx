import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TripForm from "./TripForm";

vi.mock("../lib/api", () => ({
  autocompleteLocation: vi.fn().mockResolvedValue([]),
}));

describe("TripForm", () => {
  it("keeps the carrier/vehicle details section collapsed by default", () => {
    render(<TripForm onSubmit={vi.fn()} submitting={false} errorMessage="" />);
    expect(screen.queryByLabelText("Driver name")).not.toBeInTheDocument();
  });

  it("reveals the optional fields when the details toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<TripForm onSubmit={vi.fn()} submitting={false} errorMessage="" />);

    await user.click(screen.getByText("Carrier & vehicle details (optional)"));

    expect(screen.getByLabelText("Driver name")).toBeInTheDocument();
    expect(screen.getByLabelText("Carrier name")).toBeInTheDocument();
  });

  it("submits with the required fields mapped to the expected keys", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TripForm onSubmit={onSubmit} submitting={false} errorMessage="" />);

    await user.type(screen.getByLabelText("Current location"), "Chicago, IL");
    await user.type(screen.getByLabelText("Pickup location"), "Indianapolis, IN");
    await user.type(screen.getByLabelText("Drop-off location"), "Nashville, TN");
    await user.clear(screen.getByLabelText(/Current cycle used/, { selector: "input#cycle" }));
    await user.type(document.getElementById("cycle"), "15");

    await user.click(screen.getByRole("button", { name: /Generate route/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.currentLocation).toBe("Chicago, IL");
    expect(payload.pickupLocation).toBe("Indianapolis, IN");
    expect(payload.dropoffLocation).toBe("Nashville, TN");
    expect(payload.currentCycleUsedHours).toBe(15);
  });

  it("shows the submitting state and disables the button", () => {
    render(<TripForm onSubmit={vi.fn()} submitting={true} errorMessage="" />);
    expect(screen.getByText("Planning trip…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning trip/ })).toBeDisabled();
  });

  it("renders the error message when provided", () => {
    render(<TripForm onSubmit={vi.fn()} submitting={false} errorMessage="Something broke." />);
    expect(screen.getByText("Something broke.")).toBeInTheDocument();
  });
});
