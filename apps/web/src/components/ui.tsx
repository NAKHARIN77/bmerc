"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { useId } from "react";
import { Icon, type IconName } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ───── Buttons ─────

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-navy",
  secondary: "bg-field text-navy hover:bg-soft",
  danger: "bg-[#fde8e8] text-danger hover:bg-[#fbd5d5]",
  ghost: "text-info hover:underline px-0",
};

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  ...rest
}: { variant?: Variant; busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT[variant],
        className,
      )}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

// ───── Form fields ─────

export const inputClass =
  "h-11 w-full rounded-lg border-0 bg-field px-3.5 text-sm text-ink outline-none placeholder:text-neutral focus:ring-2 focus:ring-info/40 disabled:opacity-60";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-neutral">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(inputClass, className)} {...rest} />;
export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(inputClass, className)} {...rest} />;
export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cx(inputClass, "h-24 resize-none py-3", className)} {...rest} />
);

// ───── Layout pieces ─────

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cx("rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.05)]", className)}>{children}</div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-semibold leading-[1.2] text-navy">{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

type Tone = "navy" | "info" | "success" | "warn" | "danger" | "neutral";
const TONE: Record<Tone, { text: string; bg: string; dot: string }> = {
  navy: { text: "text-navy", bg: "bg-soft", dot: "bg-navy" },
  info: { text: "text-info", bg: "bg-[#e7eefe]", dot: "bg-info" },
  success: { text: "text-success", bg: "bg-[#d1fae5]", dot: "bg-success" },
  warn: { text: "text-warn", bg: "bg-[#fef3c7]", dot: "bg-warn" },
  danger: { text: "text-danger", bg: "bg-[#fde8e8]", dot: "bg-danger" },
  neutral: { text: "text-muted", bg: "bg-soft", dot: "bg-neutral" },
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", t.text, t.bg)}>
      <span className={cx("h-[7px] w-[7px] rounded-full", t.dot)} />
      {children}
    </span>
  );
}

// Same rule as the prototype: the label decides the icon.
const kpiIcon = (label: string): IconName => {
  const k = label.toUpperCase();
  if (/JOB|TICKET|REPAIR|QUEUE|OPEN/.test(k)) return "wrench";
  if (/STOCK|PART|SKU|MINIMUM/.test(k)) return "box";
  if (/COMPANIES|SITE|TEAM|CUSTOMER|TECHNICIAN|USERS/.test(k)) return "building";
  return "dot";
};

export function Kpi({ label, value, caption, tone = "navy", icon }: { label: string; value: ReactNode; caption?: string; tone?: Tone; icon?: IconName }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted">
        <Icon name={icon ?? kpiIcon(label)} size={14} className="text-info" />
        {label}
      </div>
      <div className={cx("my-1 text-[36px] font-bold leading-[44px]", TONE[tone].text)}>{value}</div>
      {caption && <div className={cx("text-xs font-semibold", TONE[tone].text)}>{caption}</div>}
    </Card>
  );
}

export function Alert({ tone = "danger", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("mb-4 rounded-lg px-4 py-3 text-sm font-medium", t.text, t.bg)}>
      {children}
    </div>
  );
}

// ───── Tables ─────

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** In the list view, show this value large on the right (a quantity or amount). */
  emphasis?: boolean;
}

// Table-only classes (alignment, nowrap, column widths) would squeeze or overflow a list row.
const clean = (c?: string) => c?.replace(/(^|\s)(text-right|whitespace-nowrap|min-w-\S+|max-w-\S+|w-\S+)(?=\s|$)/g, " ");

/**
 * A list of records. By default it is one white panel with a row per record, like a phone app list:
 * the first column is the title, the other columns are a short "Label value" line under it, "Status" and
 * any emphasis column sit on the right, untitled columns (actions) at the end, and a chevron when the row opens.
 * variant="table" keeps a classic table, for printed documents such as invoice lines.
 */
export function Table<T>({ columns, rows, rowKey, empty = "Nothing here yet", onRowClick, variant = "list" }: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  onRowClick?: (row: T) => void;
  variant?: "list" | "table";
}) {
  if (variant === "list") {
    const [title, ...rest] = columns;
    const status = rest.find((c) => c.header === "Status");
    const big = rest.filter((c) => c.emphasis);
    const actions = rest.filter((c) => !c.header);
    const fields = rest.filter((c) => c !== status && c.header && !c.emphasis);
    return (
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">{empty}</div>
        ) : (
          <ul className="divide-y divide-soft">
            {rows.map((r) => (
              <li
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap", onRowClick && "cursor-pointer transition-colors hover:bg-[#f5f8ff]")}
              >
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <div className={cx("break-words text-[15px] font-semibold text-ink", clean(title.className))}>{title.cell(r)}</div>
                  {fields.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px]">
                      {fields.map((c) => (
                        <span key={c.header} className="min-w-0">
                          <span className="text-muted">{c.header}</span> <span className={cx("text-ink", clean(c.className))}>{c.cell(r)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {big.map((c) => (
                  <div key={c.header} className="shrink-0 text-right">
                    <div className="text-lg font-bold leading-tight text-navy">{c.cell(r)}</div>
                    <div className="text-[11px] text-muted">{c.header}</div>
                  </div>
                ))}
                {status && <div className="shrink-0">{status.cell(r)}</div>}
                {actions.length > 0 && (
                  <div className="flex shrink-0 flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {actions.map((c, i) => (
                      <div key={i}>{c.cell(r)}</div>
                    ))}
                  </div>
                )}
                {onRowClick && <span aria-hidden className="shrink-0 text-xl leading-none text-[#9aa7c2]">›</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-soft bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={cx("border-b border-soft bg-[#f6f8fd] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-4 py-8 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx("border-t border-soft", onRowClick && "cursor-pointer hover:bg-[#eef4ff]")}
              >
                {columns.map((c) => (
                  <td key={c.header} className={cx("p-4 align-middle", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Loading = ({ label = "Loading…" }: { label?: string }) => <div className="py-10 text-center text-muted">{label}</div>;

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <p className="text-danger">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

// ───── List helpers ─────

/** Previous / next for paged lists ({ items, page, limit, total } from the API). */
export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" className="h-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" className="h-8" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}


// ───── Prototype page pieces ─────

/** A link that looks like a button (Back to …, + Add …). */
export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx("inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors", VARIANT[variant], className)}
    >
      {children}
    </Link>
  );
}

/** First-column link in a table (ticket number, customer name, site). */
export const CellLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-semibold text-info hover:underline" onClick={(e) => e.stopPropagation()}>
    {children}
  </Link>
);

/** Row of three or four KPI cards. */
export const KpiRow = ({ children }: { children: ReactNode }) => <div className="my-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;

/** Full-width search box above a list (no label, like the prototype). */
export function SearchBar({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(inputClass, "min-w-[220px] flex-1")}
      />
      {children}
    </div>
  );
}

/** Filter or tab pills: one is active (filled navy), the rest are light. */
export function Pills<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-9 rounded-lg px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors",
            o.value === value ? "bg-primary text-white" : "bg-field text-navy hover:bg-soft",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cx("mb-3 text-base font-bold text-ink", className)}>{children}</h2>
);

/** Form page body: a white card, at most 720px wide, with Cancel + Save at the bottom right. */
export function FormCard({ children, error, cancelHref, submitLabel, busy, onSubmit }: {
  children: ReactNode;
  error?: string | null;
  cancelHref: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card className="max-w-[720px]">
      <form onSubmit={onSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        {children}
        <div className="mt-2 flex justify-end gap-2.5">
          <ButtonLink href={cancelHref} variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Label above value, as in the prototype detail cards. */
export function Facts({ items, cols = 2 }: { items: Array<[string, ReactNode]>; cols?: 2 | 3 }) {
  return (
    <dl className={cx("grid gap-[18px]", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium text-muted">{k}</dt>
          <dd className="break-words text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
