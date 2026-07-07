import type { ReactNode } from "react";
import { useId } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
};

/** Label + control pairing with a stable generated id. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="form-row">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint === undefined ? null : <p className="field-hint">{hint}</p>}
    </div>
  );
}
