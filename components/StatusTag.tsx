import { STATUS_META, toneFor } from "@/lib/format";

export function StatusTag({ status }: { status: string }) {
  const meta = (STATUS_META as Record<string, { label: string }>)[status];
  const tone = toneFor(status);
  return (
    <span className={`tag tag-${tone}`}>
      <span className="dotc" />
      {meta?.label ?? status}
    </span>
  );
}
