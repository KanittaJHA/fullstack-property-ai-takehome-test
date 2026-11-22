"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/ui/icon";

export function CollapsibleBrief({ label, children }: { label: string; children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let collapsed = false;
    const onScroll = () => {
      const element = panel.current;
      if (!element?.open || collapsed) return;
      const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 80;
      if (element.getBoundingClientRect().bottom <= headerHeight) {
        // Collapse once per conversation; reopening is always a manual choice.
        collapsed = true;
        const previousHeight = element.getBoundingClientRect().height;
        element.open = false;
        // Preserve the visible transcript when the content above it shrinks.
        window.scrollBy(0, element.getBoundingClientRect().height - previousHeight);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <details className="admin-summary" ref={panel} open>
    <summary className="admin-brief-toggle"><span className="admin-eyebrow">{label}</span><Icon name="chevron" size={18} /></summary>
    {children}
  </details>;
}
