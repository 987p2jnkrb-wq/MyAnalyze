import React from "react";
import { CircleHelp } from "lucide-react";
import ModuleBadge, { type ModuleBadgeTone } from "./ModuleBadge";

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
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-describedby={tooltipId}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <ModuleBadge tone={tone} size={size}>{children}<CircleHelp className="ml-1 inline" size={14} aria-hidden="true" /></ModuleBadge>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {help}
      </span>
    </span>
  );
}
