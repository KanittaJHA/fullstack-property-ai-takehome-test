"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const query = "(max-width: 1050px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

export function PropertyDetails({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const compact = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const ref = useRef<HTMLDialogElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; top: number } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!compact || !open || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scroller = scrollRef.current!;
    const thumb = thumbRef.current!;
    let hideScrollbar: ReturnType<typeof setTimeout>;
    const updateThumb = () => {
      const height = scroller.clientHeight;
      const range = scroller.scrollHeight - height;
      thumb.style.height = `${height / 2}px`;
      thumb.style.top = `${16 + (range > 0 ? scroller.scrollTop / range : 0) * (height / 2 - 32)}px`;
      thumb.style.display = range > 0 ? "block" : "none";
    };
    const revealScrollbar = () => {
      updateThumb();
      thumb.style.opacity = "1";
      clearTimeout(hideScrollbar);
      hideScrollbar = setTimeout(() => {
        if (!dragRef.current) thumb.style.opacity = "0";
      }, 800);
    };
    const observer = new ResizeObserver(updateThumb);
    observer.observe(scroller);
    if (scroller.firstElementChild)
      observer.observe(scroller.firstElementChild);
    updateThumb();
    scroller.addEventListener("scroll", revealScrollbar, { passive: true });
    return () => {
      clearTimeout(hideScrollbar);
      observer.disconnect();
      scroller.removeEventListener("scroll", revealScrollbar);
      thumb.style.opacity = "0";
      dragRef.current = null;
      document.body.style.overflow = previousOverflow;
      dialog.close();
    };
  }, [compact, open]);

  if (!compact) {
    return (
      <aside className="detail-panel" aria-label={label}>
        {children}
      </aside>
    );
  }

  return (
    <dialog
      ref={ref}
      className="property-detail-dialog"
      style={{ overflow: "hidden" }}
      aria-label={label}
      onCancel={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onOpenChange(false);
        }
      }}
    >
      <div
        ref={scrollRef}
        className="property-detail-scroll"
        style={{
          maxHeight: "calc(100dvh - 34px)",
          overflowY: "auto",
          scrollbarWidth: "none",
          overscrollBehavior: "contain",
        }}
        tabIndex={0}
        aria-label={label}
      >
        <div className="detail-panel">{children}</div>
      </div>
      <div
        ref={thumbRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 0,
          top: 16,
          zIndex: 3,
          width: 5,
          borderRadius: 999,
          background: "var(--scrollbar-thumb, #b8bbc3)",
          opacity: 0,
          transition: "opacity 150ms",
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          dragRef.current = {
            y: event.clientY,
            top: scrollRef.current!.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const scroller = scrollRef.current;
          if (!drag || !scroller) return;
          const travel = scroller.clientHeight / 2 - 32;
          scroller.scrollTop =
            drag.top +
            ((event.clientY - drag.y) / travel) *
              (scroller.scrollHeight - scroller.clientHeight);
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          scrollRef.current?.dispatchEvent(new Event("scroll"));
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          scrollRef.current?.dispatchEvent(new Event("scroll"));
        }}
      />
    </dialog>
  );
}
