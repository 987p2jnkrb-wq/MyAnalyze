import React from "react";
import { parseRequiredNumber } from "../utils/numbers";

type DecimalInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "value" | "onChange"> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
};

export default function DecimalInput({ value, onValueChange, onBlur, ...props }: DecimalInputProps) {
  const [text, setText] = React.useState(() => String(value ?? ""));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(String(value ?? ""));
  }, [value]);

  return <input
    {...props}
    ref={inputRef}
    type="text"
    inputMode="decimal"
    value={text}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^-?\d*(?:[.,]\d*)?$/.test(next)) return;
      setText(next);
      onValueChange(next);
    }}
    onBlur={(event) => {
      const parsed = parseRequiredNumber(text);
      if (Number.isFinite(parsed)) setText(String(parsed));
      onBlur?.(event);
    }}
  />;
}
