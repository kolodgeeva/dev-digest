import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { HoverCard } from "./hover-card";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HoverCard", () => {
  it("mounts its children only after hovering (lazy content)", () => {
    vi.useFakeTimers();
    render(
      <HoverCard trigger={<button>open me</button>}>
        <div>popover body</div>
      </HoverCard>,
    );
    // Trigger is always present; content is not mounted until hover.
    expect(screen.getByText("open me")).toBeInTheDocument();
    expect(screen.queryByText("popover body")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("open me").parentElement!);
    // Still hidden during the open delay.
    expect(screen.queryByText("popover body")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByText("popover body")).toBeInTheDocument();
  });

  it("closes (unmounts children) on mouse leave", () => {
    vi.useFakeTimers();
    render(
      <HoverCard trigger={<button>open me</button>}>
        <div>popover body</div>
      </HoverCard>,
    );
    const wrap = screen.getByText("open me").parentElement!;
    fireEvent.mouseEnter(wrap);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByText("popover body")).toBeInTheDocument();

    fireEvent.mouseLeave(wrap);
    // Close has a short grace delay (so the cursor can travel into the popover).
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByText("popover body")).not.toBeInTheDocument();
  });
});
