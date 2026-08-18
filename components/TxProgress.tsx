export function TxProgress({
  step,
  error,
  success,
}: {
  step?: string | null;
  error?: string | null;
  success?: string | null;
}) {
  if (error) return <div className="notice notice-red">{error}</div>;
  if (success) return <div className="notice notice-green">{success}</div>;
  if (step)
    return (
      <div className="progress">
        <span className="spinner" />
        <span>{step}</span>
      </div>
    );
  return null;
}
