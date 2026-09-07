import React, { useState } from "react";
import type { Account } from "../types/account";
import Modal from "./Modal";
import AllocationOptionSelect from "./AllocationOptionSelect";
import { accountAllocationOptions } from "./accountAllocationOptions";
import Button from "./Button";

interface RealizeModalProps {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  onSelect: (id: number) => Promise<void>;
  title: string;
}

const RealizeModal: React.FC<RealizeModalProps> = ({ open, accounts, onClose, onSelect, title }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSelect = async () => {
    if (!selectedId) {
      setError("Wybierz konto!");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSelect(selectedId);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Nie udało się zrealizować operacji.");
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setError("");
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title={title} size="sm">
        <AllocationOptionSelect autoFocus label="Konto" placeholder="Wybierz konto" options={accountAllocationOptions(accounts, false)} value={selectedId} onChange={(value) => { setSelectedId(value); setError(""); }} />
        {error && <div className="text-red-600 mb-2 text-center font-semibold">{error}</div>}
        <div className="flex flex-row justify-end gap-3 mt-6">
          <Button tone="neutral" disabled={saving} onClick={onClose}>Anuluj</Button>
          <Button tone="primary" disabled={saving} onClick={() => void handleSelect()}>{saving ? "Realizowanie…" : "Zrealizuj"}</Button>
        </div>
    </Modal>
  );
};

export default RealizeModal;
