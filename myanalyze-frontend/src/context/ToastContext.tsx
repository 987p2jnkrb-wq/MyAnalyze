import React, { createContext, useState, ReactNode } from "react";
import { ToastType, ToastContextProps } from "./toast-types";
import Toast from "../components/Toast";

const ToastContext = createContext<ToastContextProps>({
  showToast: () => {},
});

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type?: ToastType;
    visible: boolean;
  }>({ message: "", type: undefined, visible: false });

  const showToast = React.useCallback((message: string, type: ToastType = "info", duration = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast({ message, type, visible: true });
    hideTimer.current = setTimeout(() => setToast((current) => ({ ...current, visible: false })), duration);
  }, []);

  React.useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.visible && <Toast message={toast.message} type={toast.type as ToastType} />}
    </ToastContext.Provider>
  );
};

export const useToast = () => React.useContext(ToastContext);
