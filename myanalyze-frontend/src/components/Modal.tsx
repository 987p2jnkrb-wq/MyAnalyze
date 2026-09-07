import React from "react";
import { UI_LAYERS } from "./uiLayers";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  modalClassName?: string;
  preserveScroll?: boolean;
}

const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-6xl", full: "max-w-[1440px]" };
const openModalStack: symbol[] = [];

const Modal: React.FC<ModalProps> = ({ open, onClose, title, description, children, footer, size = "md", modalClassName, preserveScroll = false }) => {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const modalTokenRef = React.useRef(Symbol("modal"));
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  React.useEffect(() => {
    if (!open) return;
    const modalToken = modalTokenRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;
    openModalStack.push(modalToken);
    const isTopModal = () => openModalStack[openModalStack.length - 1] === modalToken;
    const focusableElements = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getAttribute("aria-hidden") !== "true");
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!isTopModal()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (preserveScroll) {
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }
    document.addEventListener("keydown", handleKeyboard);
    const focusFrame = window.requestAnimationFrame(() => {
      if (!isTopModal()) return;
      const preferred = dialogRef.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-modal-close]), a[href]');
      (preferred ?? dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      const wasTopModal = isTopModal();
      const stackIndex = openModalStack.lastIndexOf(modalToken);
      if (stackIndex >= 0) openModalStack.splice(stackIndex, 1);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      if (preserveScroll) window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", handleKeyboard);
      if (wasTopModal && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, preserveScroll]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/45 p-3 sm:p-6" style={{ zIndex: UI_LAYERS.modal }}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={modalClassName ?? `flex max-h-[calc(100vh-3rem)] w-full ${widths[size]} flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]`}
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && <h2 id={titleId} className="text-xl font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" data-modal-close className="-mr-1 rounded-lg px-2 text-2xl leading-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={onClose} aria-label="Zamknij">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
        {footer && <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
      </section>
    </div>
  );
};

export default Modal;
