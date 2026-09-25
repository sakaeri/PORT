"use client";

export default function Modal({ children, onClose, maxWidth }: { children: React.ReactNode; onClose: () => void; maxWidth: number }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${maxWidth}px, 100%)`, maxHeight: "88vh", overflowY: "auto", borderRadius: "var(--radius-lg)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
      >
        {children}
      </div>
    </div>
  );
}
