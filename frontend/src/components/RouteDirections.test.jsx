import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RouteDirections from "./RouteDirections";

describe("RouteDirections", () => {
  it("renders nothing when there are no steps", () => {
    const { container } = render(
      <RouteDirections legs={[{ name: "a -> b", steps: [] }]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not crash when a leg is missing `steps` entirely (older stored trips)", () => {
    // Regression guard: trips created before turn-by-turn directions
    // existed don't have `steps` on their route legs at all.
    const { container } = render(<RouteDirections legs={[{ name: "a -> b" }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders steps grouped by leg when present", () => {
    render(
      <RouteDirections
        legs={[
          { name: "current -> pickup", steps: [{ instruction: "Head north", distance_miles: 1.2 }] },
          { name: "pickup -> dropoff", steps: [{ instruction: "Turn left", distance_miles: 0.5 }] },
        ]}
      />
    );
    expect(screen.getByText(/Turn-by-turn directions \(2 steps\)/)).toBeInTheDocument();
  });
});
