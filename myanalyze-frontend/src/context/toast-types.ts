export type ToastType = "info" | "success" | "error" | "warning" | "neutral" | "deleted";

export interface ToastContextProps {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}
