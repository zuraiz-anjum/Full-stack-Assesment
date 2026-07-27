import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autocompleteLocation } from "../lib/api";
import LocationInput from "./LocationInput";

vi.mock("../lib/api", () => ({
  autocompleteLocation: vi.fn(),
}));

function ControlledLocationInput() {
  const [value, setValue] = useState("");
  return <LocationInput id="loc" label="Location" placeholder="e.g. Chicago" value={value} onChange={setValue} />;
}

describe("LocationInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows suggestions after the debounce delay once results come back", async () => {
    autocompleteLocation.mockResolvedValue([
      { label: "Chicago, IL, USA", lat: 41.8, lon: -87.6 },
      { label: "Chicago Heights, IL, USA", lat: 41.5, lon: -87.6 },
    ]);
    const user = userEvent.setup();
    render(<ControlledLocationInput />);

    await user.type(screen.getByLabelText("Location"), "Chicago");

    await waitFor(() => {
      expect(screen.getByText("Chicago, IL, USA")).toBeInTheDocument();
    });
    expect(screen.getByText("Chicago Heights, IL, USA")).toBeInTheDocument();
  });

  it("fills the input with the selected suggestion's label and closes the dropdown", async () => {
    autocompleteLocation.mockResolvedValue([{ label: "Chicago, IL, USA", lat: 41.8, lon: -87.6 }]);
    const user = userEvent.setup();
    render(<ControlledLocationInput />);

    const input = screen.getByLabelText("Location");
    await user.type(input, "Chic");
    await waitFor(() => expect(screen.getByText("Chicago, IL, USA")).toBeInTheDocument());

    await user.click(screen.getByText("Chicago, IL, USA"));

    expect(input).toHaveValue("Chicago, IL, USA");
    expect(screen.queryByText("Chicago, IL, USA")).not.toBeInTheDocument();
  });

  it("does not call the API for an empty or whitespace query on mount", () => {
    render(<ControlledLocationInput />);
    expect(autocompleteLocation).not.toHaveBeenCalled();
  });

  it("does not throw or crash when the autocomplete request fails (e.g. rate-limited)", async () => {
    autocompleteLocation.mockRejectedValue(new Error("429 Too Many Requests"));
    const onUnhandledRejection = vi.fn();
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const user = userEvent.setup();
    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location");
    await user.type(input, "Chicago");

    // Give the rejected debounce callback a tick to (not) escape.
    await new Promise((r) => setTimeout(r, 400));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(input).toHaveValue("Chicago"); // typing itself still works fine
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  });
});
