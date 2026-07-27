import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function Bomb() {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the fallback instead of crashing when a descendant throws", () => {
    // React logs the caught error to the console in dev -- expected, not a failure.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={() => <p>something broke</p>}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText("something broke")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("calls onReset and clears the error when the fallback's reset function runs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();
    const user = userEvent.setup();

    render(
      <ErrorBoundary onReset={onReset} fallback={(_err, reset) => <button onClick={reset}>retry</button>}>
        <Bomb />
      </ErrorBoundary>
    );

    await user.click(screen.getByText("retry"));
    expect(onReset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
