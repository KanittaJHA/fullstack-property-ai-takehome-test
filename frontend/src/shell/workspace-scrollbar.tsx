"use client";

import { useEffect, useRef } from "react";

// One consistent scroll indicator for the page and its scrollable panels.
export function WorkspaceScrollbar() {
  const thumbRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    let target: HTMLElement = document.documentElement;
    let timer: ReturnType<typeof setTimeout>;
    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    let travel = 1;
    let range = 1;
    const hideLater = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!dragging) thumb.dataset.visible = "false"; }, 800);
    };
    const update = () => {
      const root = target === document.documentElement || target === document.body;
      const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      const bounds = root ? { top: header, bottom: innerHeight, right: document.documentElement.clientWidth } : target.getBoundingClientRect();
      const top = Math.max(header, bounds.top) + 4;
      const bottom = Math.min(innerHeight, bounds.bottom) - 4;
      const height = Math.min(80, Math.max(0, bottom - top));
      range = target.scrollHeight - target.clientHeight;
      travel = Math.max(1, bottom - top - height);
      if (range <= 0 || height <= 0) { thumb.dataset.visible = "false"; return; }
      thumb.style.height = `${height}px`;
      thumb.style.left = `${Math.min(innerWidth, bounds.right) - 9}px`;
      thumb.style.top = `${top + Math.min(1, Math.max(0, target.scrollTop / range)) * travel}px`;
      thumb.dataset.visible = "true";
    };
    const onScroll = (event: Event) => {
      if (dragging) { update(); return; }
      const element = event.target;
      if (element === document) target = document.documentElement;
      else if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight) target = element;
      else return;
      update(); hideLater();
    };
    const down = (event: PointerEvent) => {
      dragging = true; startY = event.clientY; startScroll = target.scrollTop;
      thumb.setPointerCapture(event.pointerId); clearTimeout(timer); event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (dragging) { target.scrollTop = startScroll + (event.clientY - startY) / travel * range; update(); }
    };
    const up = () => { dragging = false; hideLater(); };
    const reset = () => { thumb.dataset.visible = "false"; };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", reset);
    thumb.addEventListener("pointerdown", down);
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up);
    thumb.addEventListener("lostpointercapture", up);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", reset);
      thumb.removeEventListener("pointerdown", down);
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", up);
      thumb.removeEventListener("lostpointercapture", up);
    };
  }, []);
  return <div ref={thumbRef} className="workspace-scroll-thumb" aria-hidden="true" data-visible="false" />;
}
