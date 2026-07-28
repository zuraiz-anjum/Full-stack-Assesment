import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../lib/ThemeContext";
import CommandPalette from "./CommandPalette";

const TRIPS = [
  { id: 1, pickup_location: "Indianapolis, IN", dropoff_location: "Nashville, TN", created_at: "2026-01-05T08:00:00Z" },
];

function renderPalette(props = {}) {
  return render(
    <ThemeProvider>
      <CommandPalette trips={TRIPS} onSelectTrip={() => {}} onNewTrip={() => {}} activeTrip={null} {...props} />
    </ThemeProvider>,
  );
}

async function openPalette(user) {
  await user.keyboard("{Control>}k{/Control}");
}

describe("CommandPalette", () => {
  it("is closed until Ctrl+K is pressed", () => {
    renderPalette();
    expect(screen.queryByPlaceholderText(/Jump to a trip/)).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K and shows recent trips when idle", async () => {
    const user = userEvent.setup();
    renderPalette();
    await openPalette(user);
    expect(screen.getByPlaceholderText(/Jump to a trip/)).toBeInTheDocument();
    expect(screen.getByText("Recent trips")).toBeInTheDocument();
    expect(screen.getByText(/Indianapolis, IN/)).toBeInTheDocument();
    expect(screen.getByText("Plan a new trip")).toBeInTheDocument();
  });

  it("hides recent trips and the reset command while a trip is being planned", async () => {
    // Both commands call setTrip(...) via a prop -- doing that while a
    // submission is still in flight would just get overwritten once that
    // submission resolves, so neither should be offered as an option.
    const user = userEvent.setup();
    renderPalette({ submitting: true });
    await openPalette(user);
    expect(screen.getByPlaceholderText(/Jump to a trip/)).toBeInTheDocument();
    expect(screen.queryByText("Recent trips")).not.toBeInTheDocument();
    expect(screen.queryByText(/Indianapolis, IN/)).not.toBeInTheDocument();
    expect(screen.queryByText("Plan a new trip")).not.toBeInTheDocument();
  });

  it("still offers the theme toggle while submitting (doesn't touch trip state)", async () => {
    const user = userEvent.setup();
    renderPalette({ submitting: true });
    await openPalette(user);
    expect(screen.getByText(/Switch to (night driving|light) mode/)).toBeInTheDocument();
  });

  it("running a command closes the palette", async () => {
    const onNewTrip = vi.fn();
    const user = userEvent.setup();
    renderPalette({ onNewTrip });
    await openPalette(user);
    await user.click(screen.getByText("Plan a new trip"));
    expect(onNewTrip).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/Jump to a trip/)).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderPalette();
    await openPalette(user);
    expect(screen.getByPlaceholderText(/Jump to a trip/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText(/Jump to a trip/)).not.toBeInTheDocument();
  });

  it("filters commands by typed query", async () => {
    const user = userEvent.setup();
    renderPalette();
    await openPalette(user);
    await user.type(screen.getByPlaceholderText(/Jump to a trip/), "night driving");
    expect(screen.getByText(/Switch to night driving mode/)).toBeInTheDocument();
    expect(screen.queryByText("Plan a new trip")).not.toBeInTheDocument();
  });
});
