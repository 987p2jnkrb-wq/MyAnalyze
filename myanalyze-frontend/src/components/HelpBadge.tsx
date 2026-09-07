import React from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import ModuleBadge, { type ModuleBadgeTone } from "./ModuleBadge";
import { useUiText } from "../i18n";
import { UI_LAYERS } from "./uiLayers";

export default function HelpBadge({
  help,
  children,
  tone = "neutral",
  size = "sm",
}: {
  help: string;
  children: React.ReactNode;
  tone?: ModuleBadgeTone;
  size?: "sm" | "md";
}) {
  const tooltipId = React.useId();
  const t = useUiText();
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ left: 0, top: 0, below: false });
  const updatePosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const halfWidth = Math.min(176, Math.max(80, window.innerWidth / 2 - 16));
    setPosition({
      left: Math.max(halfWidth, Math.min(rect.left + rect.width / 2, window.innerWidth - halfWidth)),
      top: rect.top > 120 ? rect.top - 8 : rect.bottom + 8,
      below: rect.top <= 120,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={tooltipId}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <ModuleBadge tone={tone} size={size}>{typeof children === "string" ? t(children) : children}<CircleHelp className="ml-1 inline" size={14} aria-hidden="true" /></ModuleBadge>
      </button>
      {open && createPortal(<span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none fixed w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg ${position.below ? "" : "-translate-y-full"}`}
        style={{ left: position.left, top: position.top, zIndex: UI_LAYERS.tooltip }}
      >
        {t(help)}
      </span>, document.body)}
    </span>
  );
}
