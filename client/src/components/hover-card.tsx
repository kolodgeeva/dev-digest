/* HoverCard — a lightweight hover-triggered popover. The UI kit only ships a
   click-driven `Dropdown`, so this fills the design's hover-popover need
   (PR-list findings column + detail timeline).

   The popover renders through a PORTAL with `position: fixed` anchored to the
   trigger's bounding rect, so it escapes ancestor `overflow: hidden` clipping
   (the PR-list table card clips absolutely-positioned children). Opens ~120ms
   after mouseenter; a short close grace lets the cursor travel into the popover
   so its contents stay hoverable/scrollable. IMPORTANT: `children` are mounted
   ONLY while open — callers rely on this to lazily fetch popover contents. */
"use client";

import React from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 120;
const GAP = 6;
const MARGIN = 8;

type Pos = { top: number; left: number };

export function HoverCard({
  trigger,
  children,
  align = "left",
  width = 340,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  React.useEffect(() => clearTimers, []);

  const computePos = (): Pos | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - MARGIN;
    const rawLeft = align === "right" ? r.right - width : r.left;
    const left = Math.max(MARGIN, Math.min(rawLeft, maxLeft));
    return { top: r.bottom + GAP, left };
  };

  const onEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setPos(computePos());
      setOpen(true);
    }, OPEN_DELAY_MS);
  };
  const onLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  // Hover popovers shouldn't trail a stale anchor: close if the PAGE scrolls.
  // But ignore scrolls that originate inside the popover itself (its own
  // findings list scrolls) — otherwise the popover closes the moment you try to
  // scroll it.
  React.useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Flip above the trigger when the popover would overflow the viewport bottom.
  React.useLayoutEffect(() => {
    if (!open || !pos || !popRef.current || !triggerRef.current) return;
    const h = popRef.current.offsetHeight;
    if (pos.top + h > window.innerHeight - MARGIN) {
      const r = triggerRef.current.getBoundingClientRect();
      const flipped = r.top - GAP - h;
      if (flipped >= MARGIN && flipped !== pos.top) setPos({ top: flipped, left: pos.left });
    }
  }, [open, pos]);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {trigger}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              zIndex: 1000,
              animation: "ddpop .12s ease",
              cursor: "default",
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}

export default HoverCard;
