import React from "react";
import DecimalInput from "./DecimalInput";

type PercentageInputProps = React.ComponentProps<typeof DecimalInput> & {
  containerClassName?: string;
};

export default function PercentageInput({ containerClassName = "", className = "", ...props }: PercentageInputProps) {
  return <div className={`relative ${containerClassName}`}>
    <DecimalInput {...props} className={`${className} pr-10`} />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500" aria-hidden="true">%</span>
  </div>;
}
