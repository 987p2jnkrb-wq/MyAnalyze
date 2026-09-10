import Button from "./Button";
import { useUiText } from "../i18n";

interface ModalFormActionsProps {
  onCancel: () => void;
  submitLabel: string;
  saving?: boolean;
  savingLabel?: string;
  form?: string;
  disabled?: boolean;
  onSubmit?: () => void;
}

export default function ModalFormActions({
  onCancel,
  submitLabel,
  saving = false,
  savingLabel = "Zapisywanie…",
  form,
  disabled = false,
  onSubmit,
}: ModalFormActionsProps) {
  const t = useUiText();
  return <div className="flex justify-end gap-2">
    <Button tone="neutral" disabled={saving} onClick={onCancel}>{t("Anuluj")}</Button>
    <Button type={form ? "submit" : "button"} form={form} tone="primary" disabled={saving || disabled} onClick={onSubmit}>
      {t(saving ? savingLabel : submitLabel)}
    </Button>
  </div>;
}
