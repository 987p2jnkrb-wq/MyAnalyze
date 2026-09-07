import React from "react";
import ModuleHeader from "./ModuleHeader";
import type { ModuleBadgeTone } from "./ModuleBadge";

interface ModulePageProps {
  title: string;
  children: React.ReactNode;
  backTo?: string;
  periodLabel?: string;
  badge?: React.ReactNode;
  badgeTone?: ModuleBadgeTone;
  actions?: React.ReactNode;
  maxWidth?: number | string;
  className?: string;
}

const ModulePage: React.FC<ModulePageProps> = ({
  title,
  children,
  backTo = "/",
  periodLabel,
  badge,
  badgeTone,
  actions,
  maxWidth = 1440,
  className = "",
}) => (
  <div className="min-h-screen min-w-0 w-full overflow-x-hidden bg-slate-50">
    <ModuleHeader title={title} backTo={backTo} periodLabel={periodLabel} badge={badge} badgeTone={badgeTone} />
    <main
      className={`min-w-0 w-full mx-auto px-4 sm:px-6 pt-24 pb-12 ${className}`}
      style={{ maxWidth }}
    >
      {actions && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      )}
      {children}
    </main>
  </div>
);

export default ModulePage;
