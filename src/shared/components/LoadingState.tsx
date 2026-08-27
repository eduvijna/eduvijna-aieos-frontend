export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="panel" role="status" aria-live="polite">
      <p className="muted">{label}</p>
    </div>
  );
}
