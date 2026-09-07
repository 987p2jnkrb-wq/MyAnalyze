import React, { useEffect } from "react";
import { ToastType } from "../context/toast-types";
import { UI_LAYERS } from "./uiLayers";

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose?: () => void;
  duration?: number;
}

const toastColors: Record<ToastType, string> = {
  neutral: "bg-gray-200 text-gray-800 border-gray-400",
  success: "bg-green-100 text-green-800 border-green-400",
  error: "bg-red-100 text-red-800 border-red-400",
  deleted: "bg-gray-100 text-gray-600 border-gray-300",
  info: "bg-blue-100 text-blue-800 border-blue-400",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-400",
};

export const Toast: React.FC<ToastProps> = ({ message, type = "neutral", onClose, duration = 3000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded border px-6 py-3 shadow-lg ${toastColors[type ?? "neutral"]} animate-fadeIn`}
      style={{ minWidth: 220, maxWidth: 400, zIndex: UI_LAYERS.toast }}
    >
      <span>{message}</span>
    </div>
  );
};

export default Toast;
