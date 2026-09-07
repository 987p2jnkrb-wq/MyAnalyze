import React from "react";
import { getAppLocale } from "../utils/appSettings";

interface HeaderClockProps {
  className?: string;
}

export default function HeaderClock({ className = "" }: HeaderClockProps) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const locale = getAppLocale();
  const date = now.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`flex min-w-[120px] flex-col items-end ${className}`} aria-label={`${date}, ${time}`}>
      <span className="font-mono text-xs font-semibold leading-tight tracking-wider text-blue-800">{date}</span>
      <span className="font-mono text-lg font-bold leading-none tracking-widest text-blue-900">{time}</span>
    </div>
  );
}
