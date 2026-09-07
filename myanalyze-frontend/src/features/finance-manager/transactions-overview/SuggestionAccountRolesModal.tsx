import Button from "../../../components/Button";
import Modal from "../../../components/Modal";
import { activeStatusLabel } from "../../../components/data-grid/ActiveStatus";
import type { Account } from "../../../types/account";
import type { TransactionSuggestionAccountRoles, TransactionSuggestionRole } from "../transactionLinkCandidates";

const ROLE_OPTIONS: Array<{ value: TransactionSuggestionRole; label: string }> = [
  { value: "both", label: "Oba kierunki" },
  { value: "income", label: "Tylko jako przychód" },
  { value: "expense", label: "Tylko jako wydatek" },
  { value: "off", label: "Pomiń w sugestiach" },
];

export default function SuggestionAccountRolesModal({ open, accounts, roles, onChange, onReset, onClose }: { open: boolean; accounts: Account[]; roles: TransactionSuggestionAccountRoles; onChange: (accountId: number, role: TransactionSuggestionRole) => void; onReset: () => void; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Role kont w sugestiach transferów" size="md" footer={<div className="flex flex-wrap justify-between gap-2"><Button tone="neutral" onClick={onReset}>Przywróć wszystkie: oba</Button><Button tone="primary" onClick={onClose}>Gotowe</Button></div>}>
    <div className="space-y-3">
      <p className="text-sm leading-6 text-slate-600">To ustawienie działa tylko w zakładce <strong>Do sprawdzenia</strong>. Nie zmienia kierunku transakcji, danych historycznych ani ręcznego pickera. Użyj go, jeśli wiesz np. że portfel Vinted jest zwykle stroną wypływu, a konkretne konto bankowe stroną wpływu.</p>
      <div className="overflow-hidden rounded-lg border border-slate-200">{accounts.map((account) => {
        const role = roles[String(account.id)] ?? "both";
        return <div key={account.id} className="grid gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center"><div className="min-w-0"><strong className="block truncate text-sm text-slate-800">{account.nazwa}</strong><span className="block text-xs text-slate-500">{account.typ_depozytu.replace(/_/g, " ")}{account.active === false ? ` · ${activeStatusLabel(account.active).toLocaleLowerCase("pl-PL")}` : ""}</span></div><select aria-label={`Rola konta ${account.nazwa} w sugestiach`} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={role} onChange={(event) => onChange(account.id, event.target.value as TransactionSuggestionRole)}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
      })}</div>
      <p className="text-xs leading-5 text-slate-500"><strong>Oba kierunki</strong> zachowuje dotychczasowe działanie. Jawne ustawienie <strong>Wydatek</strong> po jednej stronie i <strong>Przychód</strong> po drugiej może podnieść jednoznaczną parę do bezpiecznej sugestii batchowej.</p>
    </div>
  </Modal>;
}
