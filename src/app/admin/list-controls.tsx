import Link from "next/link";
import { PAGE_SIZE } from "@/server/admin-search";

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
