import React from "react";
import DecimalInput from "./DecimalInput";
import { getAppCurrency } from "../utils/appSettings";

type MoneyInputProps = React.ComponentProps<typeof DecimalInput> & {
  currency?: string;
  containerClassName?: string;
};

export default function MoneyInput({ currency = getAppCurrency(), containerClassName = "", className = "", ...props }: MoneyInputProps) {
  return <div className={`relative ${containerClassName}`}>
    <DecimalInput {...props} className={`${className} pr-14`} />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500" aria-hidden="true">{currency}</span>
  </div>;
}
