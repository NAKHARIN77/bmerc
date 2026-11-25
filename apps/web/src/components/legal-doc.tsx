import type { ReactNode } from "react";

/** Headings, paragraphs and lists with readable spacing for long legal text. */
export function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl bg-white p-6 text-[15px] leading-7 text-ink shadow-[0_1px_2px_rgba(0,0,0,.05)] sm:p-10 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-navy [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-2xl font-bold text-navy sm:text-[28px]">{title}</h1>
      {children}
    </article>
  );
}
