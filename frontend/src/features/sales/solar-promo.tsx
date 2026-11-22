"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";
import "./solar-promo.css";

const stars = [[8, 12, 2.5], [21, 75, 2], [33, 92, 1.5], [44, 18, 2], [47, 81, 2.5], [55, 7, 1.5], [61, 30, 2], [73, 88, 1.5], [82, 19, 2], [93, 76, 2.5]];
const EDGE = 8;

const MAX_SPEED = 1.5; // px per ms, so a fling glides at most ~150px

/** Keep a card of the element's size inside the viewport and below the site header, EDGE px from each side. */
function clampToViewport(element: HTMLElement | null, x: number, y: number) {
  const box = element?.getBoundingClientRect();
  const width = box?.width ?? 0, height = box?.height ?? 0;
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 0;
  return {
    x: Math.min(Math.max(x, EDGE), window.innerWidth - width - EDGE),
    y: Math.min(Math.max(y, header + EDGE), window.innerHeight - height - EDGE),
  };
}

/**
 * SunPro solar promo card. In the chat it opens the package panel (`onExplore`);
 * elsewhere it links to the Graspia chat (`href`) and can float with a close button (`onClose`).
 * A `draggable` card can be moved anywhere inside the viewport by mouse or touch.
 */
export function SolarPromo({ onExplore, href, onClose, draggable = false, className = "" }: {
  onExplore?: () => void; href?: string; onClose?: () => void; draggable?: boolean; className?: string;
}) {
  const { t } = useWorkspace();
  const label: ReactNode = t("Explore", "ดูแพ็กเกจ");
  const card = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number; x: number; y: number; t: number; vx: number; vy: number } | null>(null);
  const frame = useRef(0);
  const [position, setPosition] = useState<{ x: number; y: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Keep a moved card on screen when the window is resized.
  useEffect(() => {
    if (!position) return;
    const onResize = () => setPosition(current => current && { ...current, ...clampToViewport(card.current, current.x, current.y) });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [position]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const moveTo = (x: number, y: number, width: number) => setPosition({ ...clampToViewport(card.current, x, y), width });
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggable || (event.target as Element).closest("a, button")) return;
    cancelAnimationFrame(frame.current);
    const box = event.currentTarget.getBoundingClientRect();
    grab.current = { dx: event.clientX - box.left, dy: event.clientY - box.top, x: event.clientX, y: event.clientY, t: event.timeStamp, vx: 0, vy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    // An in-page card (the chat) lifts out of the layout and floats from where it was.
    setPosition({ x: box.left, y: box.top, width: box.width });
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || !position) return;
    const dt = Math.max(event.timeStamp - g.t, 1);
    // Smoothed velocity (px/ms) for the glide after release.
    g.vx = g.vx * 0.6 + ((event.clientX - g.x) / dt) * 0.4;
    g.vy = g.vy * 0.6 + ((event.clientY - g.y) / dt) * 0.4;
    g.x = event.clientX; g.y = event.clientY; g.t = event.timeStamp;
    const { width } = position;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => moveTo(event.clientX - g.dx, event.clientY - g.dy, width));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    grab.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (!position || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Glide on with the release speed, easing out until it stops.
    const speed = Math.hypot(g.vx, g.vy);
    const cap = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
    let vx = g.vx * cap, vy = g.vy * cap;
    let { x, y } = clampToViewport(card.current, event.clientX - g.dx, event.clientY - g.dy);
    const { width } = position;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 32); last = now;
      vx *= Math.pow(0.88, dt / 16); vy *= Math.pow(0.88, dt / 16);
      ({ x, y } = clampToViewport(card.current, x + vx * dt, y + vy * dt));
      setPosition({ x, y, width });
      if (Math.hypot(vx, vy) > 0.02) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  return <div ref={card}
    className={`new-chat-promo ${className} ${draggable ? "draggable" : ""} ${dragging ? "dragging" : ""} ${position ? "moved" : ""}`}
    style={position ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto", width: position.width, margin: 0 } : undefined}
    title={draggable ? t("Drag to move", "ลากเพื่อย้ายตำแหน่ง") : undefined}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <span className="promo-stars" aria-hidden="true">
      {stars.map(([left, top, size], index) => (
        <span key={index} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDelay: `${-index * 0.7}s`, animationDuration: `${3.2 + (index % 4) * 0.8}s` }} />
      ))}
    </span>
    <div>
      <strong>{t("A brighter home starts here", "เริ่มต้นบ้านพลังงานสะอาด")}</strong>
      <p>{t("Explore solar with SunPro", "ค้นหาโซลาร์ที่ใช่กับ SunPro")}</p>
    </div>
    {href
      ? <Link href={href} className="promo-action">{label}</Link>
      : <button type="button" className="promo-action" aria-controls="sales-context-panel" onClick={onExplore}>{label}</button>}
    {onClose && <button type="button" className="promo-close" aria-label={t("Close", "ปิด")} onClick={onClose}><Icon name="close" size={14} /></button>}
  </div>;
}
