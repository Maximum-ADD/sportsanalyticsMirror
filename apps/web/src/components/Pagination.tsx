import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  // "dark" is the original panel-styled pager the dark-themed pages (teams,
  // compare) use. "locker" is the sharp, numbered pager — range summary
  // plus an ellipsis-compressed row of page numbers — the light locker
  // pages use. Defaults to "dark" so existing callers are unchanged.
  tone?: "dark" | "locker";
}

export function Pagination({ page, pageSize, total, onPageChange, tone = "dark" }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (tone === "locker") {
    return (
      <LockerPagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} onPageChange={onPageChange} />
    );
  }

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
      <span>
        Page {page} of {totalPages} ({total} total)
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

interface LockerPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Compresses the page list to first, last, and a three-page window around
// the current page, joining the gaps with an ellipsis: on page 1 of 48
// that's 1 2 3 … 48, on page 24 it's 1 … 23 24 25 … 48. The window slides
// rather than growing so it always earns its ellipsis on narrow screens;
// at the ends it clamps so the first/last page never duplicate.
const WINDOW_RADIUS = 1;

function buildPageItems(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const shownPages = new Set<number>([1, totalPages]);

  // Clamp the window (not just its edges): near the start it slides right,
  // near the end it slides left, keeping three consecutive pages visible.
  const windowStart = Math.min(Math.max(currentPage - WINDOW_RADIUS, 1), Math.max(totalPages - WINDOW_RADIUS * 2, 1));
  for (let candidate = windowStart; candidate <= windowStart + WINDOW_RADIUS * 2; candidate++) {
    if (candidate > 1 && candidate < totalPages) shownPages.add(candidate);
  }

  const items: (number | "ellipsis")[] = [];
  let previousPage = 0;
  for (const pageNumber of [...shownPages].sort((a, b) => a - b)) {
    if (pageNumber - previousPage > 1) items.push("ellipsis");
    items.push(pageNumber);
    previousPage = pageNumber;
  }
  return items;
}

const PAGER_BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-40";

function LockerPagination({ page, pageSize, total, totalPages, onPageChange }: LockerPaginationProps) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase">
        Showing {rangeStart}–{rangeEnd} of {total}
      </span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={PAGER_BUTTON_CLASS}
        >
          Prev
        </button>
        {buildPageItems(page, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="px-1 font-mono text-[10.5px] text-locker-ink-muted"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                PAGER_BUTTON_CLASS,
                item === page && "border-locker-leather bg-locker-leather text-white hover:border-locker-leather"
              )}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={PAGER_BUTTON_CLASS}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
