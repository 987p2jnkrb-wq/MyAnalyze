import React from "react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = "Potwierdź akcję",
  message,
  confirmLabel = "Tak",
  cancelLabel = "Nie",
  busy = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-wrap-reverse justify-end gap-2">
          <Button
            tone="neutral"
            onClick={onCancel}
            type="button"
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            tone="danger"
            onClick={onConfirm}
            type="button"
            disabled={busy}
            autoFocus
          >
            {busy ? "Usuwanie…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-700 sm:text-base">{message}</p>
    </Modal>
  );
};

export default ConfirmModal;
