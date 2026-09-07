/* Katalog jest współdzielony przez komponent ikony i edytor konfiguracji. */
/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from "react";
import {
  FaBalanceScale, FaCalendarDay, FaCalendarWeek, FaCashRegister, FaChartBar, FaChartLine, FaChartPie,
  FaClipboardList, FaCog, FaCoins, FaCreditCard, FaDollarSign, FaExchangeAlt, FaFileAlt,
  FaFileInvoiceDollar, FaHandHoldingUsd, FaLayerGroup, FaMoneyBillWave, FaMoneyCheck, FaMoneyCheckAlt,
  FaPiggyBank, FaPuzzlePiece, FaRocket, FaSlidersH, FaStar, FaTools, FaUniversity, FaUserCog, FaWallet,
  FaReceipt,
} from "react-icons/fa";
import RecurringExpenseIcon from "../../icons/RecurringExpenseIcon";
import RecurringIncomeIcon from "../../icons/RecurringIncomeIcon";

type ModuleIconComponent = ComponentType<{ className?: string }>;

export interface ModuleIconOption {
  key: string;
  value: string;
  Icon: ModuleIconComponent;
  color: string;
}

export const MODULE_ICON_OPTIONS: ModuleIconOption[] = [
  { key: "FaWallet", Icon: FaWallet, value: "fa-solid fa-wallet", color: "text-blue-500" },
  { key: "FaMoneyBillWave", Icon: FaMoneyBillWave, value: "fa-solid fa-money-bill", color: "text-green-500" },
  { key: "FaCoins", Icon: FaCoins, value: "fa-solid fa-coins", color: "text-red-500" },
  { key: "FaChartLine", Icon: FaChartLine, value: "fa-solid fa-chart-line", color: "text-indigo-500" },
  { key: "FaPiggyBank", Icon: FaPiggyBank, value: "fa-solid fa-piggy-bank", color: "text-purple-500" },
  { key: "FaHandHoldingUsd", Icon: FaHandHoldingUsd, value: "fa-solid fa-hand-holding-usd", color: "text-indigo-500" },
  { key: "FaBalanceScale", Icon: FaBalanceScale, value: "fa-solid fa-balance-scale", color: "text-blue-500" },
  { key: "FaClipboardList", Icon: FaClipboardList, value: "fa-solid fa-clipboard-list", color: "text-yellow-500" },
  { key: "FaSlidersH", Icon: FaSlidersH, value: "fa-solid fa-sliders-h", color: "text-blue-700" },
  { key: "FaChartPie", Icon: FaChartPie, value: "fa-solid fa-chart-pie", color: "text-green-500" },
  { key: "FaCalendarDay", Icon: FaCalendarDay, value: "fa-solid fa-calendar-day", color: "text-blue-400" },
  { key: "FaCalendarWeek", Icon: FaCalendarWeek, value: "fa-solid fa-calendar-week", color: "text-blue-400" },
  { key: "FaCreditCard", Icon: FaCreditCard, value: "fa-solid fa-credit-card", color: "text-pink-500" },
  { key: "FaMoneyCheck", Icon: FaMoneyCheck, value: "fa-solid fa-money-check", color: "text-lime-500" },
  { key: "FaDollarSign", Icon: FaDollarSign, value: "fa-solid fa-dollar-sign", color: "text-green-700" },
  { key: "FaReceipt", Icon: FaReceipt, value: "fa-solid fa-receipt", color: "text-gray-600" },
  { key: "FaChartBar", Icon: FaChartBar, value: "fa-solid fa-chart-bar", color: "text-sky-700" },
  { key: "FaUniversity", Icon: FaUniversity, value: "fa-solid fa-university", color: "text-blue-900" },
  { key: "FaCashRegister", Icon: FaCashRegister, value: "fa-solid fa-cash-register", color: "text-orange-500" },
  { key: "FaExchangeAlt", Icon: FaExchangeAlt, value: "fa-solid fa-exchange-alt", color: "text-emerald-700" },
  { key: "FaFileInvoiceDollar", Icon: FaFileInvoiceDollar, value: "fa-solid fa-file-invoice-dollar", color: "text-yellow-800" },
  { key: "FaMoneyCheckAlt", Icon: FaMoneyCheckAlt, value: "fa-solid fa-money-check-alt", color: "text-green-900" },
  { key: "FaFileAlt", Icon: FaFileAlt, value: "fa-solid fa-file-alt", color: "text-gray-500" },
  { key: "RecurringExpenseIcon", Icon: RecurringExpenseIcon, value: "recurring-expense", color: "text-red-500" },
  { key: "RecurringIncomeIcon", Icon: RecurringIncomeIcon, value: "recurring-income", color: "text-green-500" },
  { key: "FaCog", Icon: FaCog, value: "fa-solid fa-cog", color: "text-gray-500" },
  { key: "FaUserCog", Icon: FaUserCog, value: "fa-solid fa-user-cog", color: "text-blue-700" },
  { key: "FaPuzzlePiece", Icon: FaPuzzlePiece, value: "fa-solid fa-puzzle-piece", color: "text-purple-500" },
  { key: "FaLayerGroup", Icon: FaLayerGroup, value: "fa-solid fa-layer-group", color: "text-indigo-500" },
  { key: "FaRocket", Icon: FaRocket, value: "fa-solid fa-rocket", color: "text-orange-500" },
  { key: "FaStar", Icon: FaStar, value: "fa-solid fa-star", color: "text-yellow-500" },
  { key: "FaTools", Icon: FaTools, value: "fa-solid fa-tools", color: "text-slate-600" },
];

const FALLBACKS: Record<string, ModuleIconOption> = {
  manager: { key: "ManagerFallback", value: "", Icon: FaClipboardList, color: "text-yellow-500" },
  config: { key: "ConfigFallback", value: "", Icon: FaSlidersH, color: "text-blue-700" },
  logi: { key: "LogsFallback", value: "", Icon: FaClipboardList, color: "text-gray-500" },
};
const DEFAULT_FALLBACK: ModuleIconOption = { key: "DefaultFallback", value: "", Icon: FaCog, color: "text-gray-400" };

export function ModuleIcon({ value, moduleKey, className = "text-2xl", colored = false }: {
  value?: string;
  moduleKey: string;
  className?: string;
  colored?: boolean;
}) {
  const option = MODULE_ICON_OPTIONS.find((item) => item.value === value) ?? FALLBACKS[moduleKey] ?? DEFAULT_FALLBACK;
  return <option.Icon className={`${className} ${colored ? option.color : ""}`} />;
}
