type StatProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint === undefined ? null : <p className="muted stat-hint">{hint}</p>}
    </div>
  );
}
