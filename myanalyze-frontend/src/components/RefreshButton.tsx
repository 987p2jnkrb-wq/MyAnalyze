import React from "react";
import { RefreshCw } from "lucide-react";
import IconButton from "./IconButton";

interface RefreshButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "aria-label" | "title"> {
  onRefresh: () => unknown | Promise<unknown>;
  refreshing?: boolean;
  label?: string;
  iconSize?: number;
}

export default function RefreshButton({ onRefresh, refreshing = false, label = "Odśwież", iconSize = 18, disabled, ...props }: RefreshButtonProps) {
  const accessibleLabel = refreshing ? `${label} — trwa odświeżanie` : label;
  return (
    <IconButton
      {...props}
      label={accessibleLabel}
      disabled={disabled || refreshing}
      onClick={() => { void Promise.resolve().then(() => onRefresh()).catch(() => undefined); }}
    >
      <RefreshCw size={iconSize} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
    </IconButton>
  );
}
