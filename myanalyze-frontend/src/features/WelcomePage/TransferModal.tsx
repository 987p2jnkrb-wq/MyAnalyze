import React, { useState } from "react";
import type { Account } from "../../types/account";
import Modal from "../../components/Modal";
import ModalFormActions from "../../components/ModalFormActions";
import MoneyInput from "../../components/MoneyInput";
import { parseRequiredNumber } from "../../utils/numbers";
import { formatCurrency } from "../../utils/formatters";

interface TransferModalProps {
  open: boolean;
  fromAccount: Account;
  accounts: Account[];
  onClose: () => void;
  onTransfer: (fromId: number, toId: number, amount: number) => Promise<void>;
}

const TransferModal: React.FC<TransferModalProps> = ({ open, fromAccount, accounts, onClose, onTransfer }) => {
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleTransfer = async () => {
    if (submitting) return;
    if (!toId) {
      setError("Wybierz konto docelowe!");
      return;
    }
    const amountNum = parseRequiredNumber(amount);
    const saldoNum = Number(fromAccount.saldo_dostepne);
    if (isNaN(amountNum) || amountNum <= 0 || isNaN(saldoNum) || amountNum > saldoNum) {
      setError("Podaj poprawną kwotę (nie większą niż saldo konta źródłowego)!");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onTransfer(fromAccount.id, toId, amountNum);
      onClose();
    } catch {
      setError("Nie udało się wykonać przelewu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { if (!submitting) onClose(); }} title={`Przelej środki z: ${fromAccount.nazwa}`} size="md" footer={<ModalFormActions saving={submitting} savingLabel="Przelewanie…" onCancel={onClose} form="account-transfer-form" submitLabel="Przelej" />}>
            <form id="account-transfer-form" onSubmit={(event) => { event.preventDefault(); void handleTransfer(); }}>
              <label className="block mb-2 font-semibold">Na konto:</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
                value={toId ?? ""}
                disabled={submitting}
                onChange={e => setToId(Number(e.target.value))}
              >
                <option value="">Wybierz konto docelowe</option>
                {accounts.filter(acc => acc.id !== fromAccount.id).map((acc, idx) => (
                  <option key={`acc-${acc.id}-${idx}`} value={acc.id}>{acc.nazwa} (saldo: {formatCurrency(acc.saldo_dostepne)})</option>
                ))}
              </select>
              <label className="block mb-2 font-semibold">Kwota:</label>
              <MoneyInput
                className="w-full border border-gray-300 rounded px-3 py-2"
                containerClassName="mb-2"
                min={0.01}
                max={fromAccount.saldo_dostepne}
                value={amount}
                disabled={submitting}
                onValueChange={setAmount}
              />
              {error && <div className="text-red-600 mb-2 text-center font-semibold">{error}</div>}
            </form>
    </Modal>
  );
};

export default TransferModal;
