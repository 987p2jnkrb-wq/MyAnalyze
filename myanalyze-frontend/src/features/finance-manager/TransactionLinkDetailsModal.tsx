import { ArrowRightLeft, Link2, Unlink2 } from "lucide-react";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import ModuleBadge from "../../components/ModuleBadge";
import type { TransactionModel } from "../../context/useTransactionResource";
import { formatCurrency, formatDate } from "../../utils/formatters";
import type { TransactionKind } from "./transactionLinks";

type LinkDisplayTransaction = Pick<TransactionModel, "name" | "amount" | "addedAt" | "accountId" | "customTypeName"> & { accountName?: string };

function TransactionSide({ title, kind, row, accountNames }: { title: string; kind: TransactionKind; row: LinkDisplayTransaction; accountNames: Map<number, string> }) {
  const account = row.accountName ?? (row.accountId == null ? "Bez konta" : accountNames.get(row.accountId) ?? `#${row.accountId}`);
  const amount = kind === "income" ? Math.abs(Number(row.amount)) : -Math.abs(Number(row.amount));
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</span><ModuleBadge tone={kind === "income" ? "success" : "danger"} size="sm">{kind === "income" ? "Przychód" : "Wydatek"}</ModuleBadge></div>
    <strong className="block break-words text-base text-slate-900">{row.name}</strong>
    <div className="mt-2 grid gap-1 text-sm text-slate-600"><span><strong className="text-slate-700">Kwota:</strong> {formatCurrency(amount)}</span><span><strong className="text-slate-700">Data:</strong> {formatDate(row.addedAt)}</span><span><strong className="text-slate-700">Konto:</strong> {account}</span><span><strong className="text-slate-700">Etykieta:</strong> {row.customTypeName ?? "Bez etykiety"}</span></div>
  </div>;
}

export default function TransactionLinkDetailsModal({ open, sourceKind, source, counterpartKind, counterpart, accountNames, onClose, onChange, onUnlink, preview = false, onConfirm, previewMessage, confirmLabel = "Powiąż jako transfer własny" }: { open: boolean; sourceKind: TransactionKind; source: LinkDisplayTransaction | null; counterpartKind: TransactionKind | null; counterpart: LinkDisplayTransaction | null; accountNames: Map<number, string>; onClose: () => void; onChange: () => void; onUnlink: () => void; preview?: boolean; onConfirm?: () => void; previewMessage?: string; confirmLabel?: string }) {
  const amountDifference = source && counterpart ? Math.abs(Number(source.amount) - Number(counterpart.amount)) : 0;
  const dateDifference = source && counterpart ? Math.abs(Date.parse(`${source.addedAt.slice(0, 10)}T00:00:00Z`) - Date.parse(`${counterpart.addedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000 : 0;
  return <Modal open={open} onClose={onClose} title={preview ? "Porównaj sugerowany transfer" : "Powiązanie transferu własnego"} size="lg">
    {source && <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800"><ArrowRightLeft size={18} aria-hidden="true" /><span>{preview ? (previewMessage ?? "To tylko sugestia. Potwierdzenie utworzy transfer własny i wyłączy obie strony z analiz.") : "Obie operacje pozostają w historii, ale potwierdzony cross-link wyłącza je z przychodów i wydatków w analizach."}</span></div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center"><TransactionSide title="Ta transakcja" kind={sourceKind} row={source} accountNames={accountNames} /><ArrowRightLeft className="mx-auto text-slate-400" size={22} aria-hidden="true" />{counterpart && counterpartKind ? <TransactionSide title="Druga strona" kind={counterpartKind} row={counterpart} accountNames={accountNames} /> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nie udało się odnaleźć drugiej transakcji w aktualnie załadowanych danych. Powiązanie nadal istnieje i można je zmienić albo usunąć.</div>}</div>
      {preview && counterpart && <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span>Różnica kwoty: <strong>{formatCurrency(amountDifference)}</strong></span><span>Różnica dat: <strong>{dateDifference} dni</strong></span></div>}
      <p className="text-xs leading-5 text-slate-600">Powiązanie można później zmienić lub usunąć w Transakcjach → Powiązane. Usunięcie powiązania zachowa obie operacje i ponownie uwzględni je w analizach, chyba że zostały również wyłączone ręcznie. Etykieta sama nie oznacza transferu.</p>
      {preview
        ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><Button tone="neutral" onClick={onClose}>Anuluj</Button><Button tone="primary" onClick={onConfirm}><Link2 size={17} aria-hidden="true" />{confirmLabel}</Button></div>
        : <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><Button tone="neutral" onClick={onClose}>Zamknij</Button><Button tone="secondary" onClick={onChange}><Link2 size={17} aria-hidden="true" />Zmień powiązanie</Button><Button tone="danger" onClick={onUnlink}><Unlink2 size={17} aria-hidden="true" />Usuń powiązanie</Button></div>}
    </div>}
  </Modal>;
}
