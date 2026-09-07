import React from "react";
import { IoArrowBack } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import ModuleBadge, { ModuleBadgeTone } from "./ModuleBadge";
import HeaderClock from "./HeaderClock";

interface ModuleHeaderProps {
  title: string;
  backTo?: string;
  periodLabel?: string;
  badge?: React.ReactNode;
  badgeTone?: ModuleBadgeTone;
}

const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, backTo = "/", periodLabel, badge, badgeTone = "info" }) => {
  const navigate = useNavigate();
  return (
    <header
      className="fixed top-0 bg-white text-blue-700 shadow-md z-50 flex items-center px-4 sm:px-6 h-16 border-b border-gray-200 justify-between"
      style={{ left: 0, right: 0, width: "auto", maxWidth: "none" }}
    >
      <div className="flex items-center min-w-0">
        <button
          type="button"
          aria-label="Powrót"
          className="mr-3 shrink-0 rounded-lg p-1 text-2xl hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:mr-4"
          onClick={() => navigate(backTo)}
        >
          <IoArrowBack />
        </button>
        <span className="text-xl sm:text-2xl font-bold tracking-tight mr-4 truncate">{title}</span>
        {(badge || periodLabel) && <ModuleBadge tone={badgeTone} size="sm" className="ml-2 hidden md:inline-flex">{badge || periodLabel}</ModuleBadge>}
      </div>
      <HeaderClock className="hidden sm:flex" />
    </header>
  );
};

export default ModuleHeader;
