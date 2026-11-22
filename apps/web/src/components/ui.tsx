"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useId } from "react";
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
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
      <span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}

export function Kpi({ label, value, caption, tone = "navy", icon = "dot" }: { label: string; value: ReactNode; caption?: string; tone?: Tone; icon?: IconName }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        <Icon name={icon} size={14} className="text-info" />
        {label}
      </div>
      <div className={cx("mt-1 text-3xl font-bold", TONE[tone].text)}>{value}</div>
      {caption && <div className="mt-0.5 text-xs text-muted">{caption}</div>}
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
}

export function Table<T>({ columns, rows, rowKey, empty = "Nothing here yet", onRowClick }: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={cx("bg-navy px-4 py-3.5 text-xs font-semibold uppercase text-white", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx("border-t border-soft", onRowClick && "cursor-pointer hover:bg-field")}
              >
                {columns.map((c) => (
                  <td key={c.header} className={cx("px-4 py-3.5 align-middle", c.className)}>
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

// ───── Drawer (side panel for create / edit forms) ─────

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Close panel" className="absolute inset-0 bg-navy/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-field">
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
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
  if (total <= limit) return <p className="mt-3 text-xs text-muted">{total === 1 ? "1 result" : `${total} results`}</p>;
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

/** Row of filters above a list. Wraps on narrow screens. */
export const Toolbar = ({ children }: { children: ReactNode }) => <div className="mb-4 flex flex-wrap items-end gap-3 [&>*]:min-w-[180px] [&>*]:flex-1 md:[&>*]:max-w-[260px]">{children}</div>;

/** Label / value pairs in a drawer or detail card. */
export function DetailList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="mb-5 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A block of free text (fault description, notes). */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-lg bg-field p-3 text-sm">
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      <div className="whitespace-pre-wrap text-ink">{children}</div>
    </div>
  );
}
