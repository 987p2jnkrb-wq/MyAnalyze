import React from "react";

export type ModuleBadgeTone = "neutral" | "info" | "success" | "danger" | "warning" | "violet";

interface ModuleBadgeProps {
  children: React.ReactNode;
  tone?: ModuleBadgeTone;
  size?: "sm" | "md";
  className?: string;
}

const toneClasses: Record<ModuleBadgeTone, string> = {
  neutral: "border-gray-200 bg-gray-100 text-gray-700",
  info: "border-blue-100 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-100 text-green-800",
  danger: "border-red-200 bg-red-100 text-red-800",
  warning: "border-orange-200 bg-orange-100 text-orange-800",
  violet: "border-violet-200 bg-violet-100 text-violet-800",
};

const sizeClasses = {
  sm: "px-3 py-1 text-sm",
  md: "px-3 py-1 text-base sm:px-4 sm:text-lg",
};

export default function ModuleBadge({ children, tone = "neutral", size = "md", className = "" }: ModuleBadgeProps) {
  return (
    <span className={`money-value inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border font-semibold shadow-sm ${toneClasses[tone]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  );
}
