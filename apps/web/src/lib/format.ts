const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const fmtDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "—");
export const fmtLimit = (used: number, limit: number | null) => (limit === null ? `${used} / no limit` : `${used} / ${limit}`);
