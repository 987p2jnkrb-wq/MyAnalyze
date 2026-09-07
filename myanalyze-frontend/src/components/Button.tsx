import React from "react";

export type ButtonTone = "primary" | "secondary" | "neutral" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
}

const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const tones = {
  primary: "border border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
  neutral: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-100",
  ghost: "border border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
};
const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2" };

export default function Button({ tone = "neutral", size = "md", type = "button", className = "", children, ...props }: ButtonProps) {
  return <button {...props} type={type} className={`${base} ${tones[tone]} ${sizes[size]} ${className}`}>{children}</button>;
}
