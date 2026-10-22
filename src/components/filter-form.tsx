"use client";

/** A GET form whose selects apply as soon as they change; the text search applies on Enter or "Sök". */
export function FilterForm({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      role="search"
      className={className}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** A labelled filter select; the empty option means "any". */
export function Select({
  label,
  name,
  value,
  options,
  all = "Alla",
}: {
  label: string;
  name: string;
  value: string | undefined;
  options: (readonly [string, string])[] | [string, string][];
  all?: string;
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="input">
        <option value="">{all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
