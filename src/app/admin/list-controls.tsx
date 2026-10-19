import Link from "next/link";
import { PAGE_SIZE } from "@/server/admin-search";

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

export function Pager({ total, page, href }: { total: number; page: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-soft">
      <span>
        Visar {from}–{to} av {total}
      </span>
      {pages > 1 ? (
        <span className="flex gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn-secondary px-3 py-1.5">
              Föregående
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={href(page + 1)} className="btn-secondary px-3 py-1.5">
              Nästa
            </Link>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
