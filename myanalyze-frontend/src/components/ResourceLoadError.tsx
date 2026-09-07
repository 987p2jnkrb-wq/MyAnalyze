export default function ResourceLoadError({ message, onRetry, retrying = false, blocking = false }: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  blocking?: boolean;
}) {
  const tone = blocking
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
  const buttonTone = blocking
    ? "border-red-300 text-red-700 hover:bg-red-100"
    : "border-amber-300 text-amber-800 hover:bg-amber-100";

  return <div role="alert" className={`flex ${blocking ? "min-h-[320px] flex-col justify-center text-center" : "flex-wrap justify-between"} items-center gap-3 rounded-xl border p-4 text-sm ${tone}`}>
    <span>{message}{!blocking && " Widoczne dane mogą być nieaktualne."}</span>
    <button type="button" disabled={retrying} className={`rounded-lg border bg-white px-3 py-1.5 font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${buttonTone} ${blocking ? "focus-visible:ring-red-500" : "focus-visible:ring-amber-500"}`} onClick={onRetry}>
      {retrying ? "Ponawianie…" : "Spróbuj ponownie"}
    </button>
  </div>;
}
