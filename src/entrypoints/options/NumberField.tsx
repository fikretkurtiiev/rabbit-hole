interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Math.round(Number(e.target.value));
          if (next >= min && next <= max) onChange(next);
        }}
        className="w-28 rounded-lg border border-rh-border bg-rh-bg px-2 py-1 text-right"
      />
    </label>
  );
}
