import React from "react";

type IconButtonTone = "neutral" | "primary" | "info" | "danger";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: IconButtonTone;
}

const toneClasses: Record<IconButtonTone, string> = {
  neutral: "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  info: "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-700",
};

export default function IconButton({ label, title = label, tone = "neutral", className = "", children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={title}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
