"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApi } from "@/lib/use-api";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  features: string[];
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const btn = "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,.05)]";
const primary = `${btn} bg-primary text-white hover:bg-navy`;
const secondary = `${btn} bg-field text-navy hover:bg-soft`;

/** Public landing page, laid out as the prototype's "Landing" screen. */
export function Landing() {
  const plans = useApi<Plan[]>("/plans");
  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between bg-white px-5 sm:px-10">
        <b className="text-base text-navy">BMERC</b>
        <nav className="flex items-center gap-4 text-muted sm:gap-7">
          <a href="#features" className="hidden hover:text-navy md:inline">
            Solutions
          </a>
          <a href="#packages" className="hidden hover:text-navy md:inline">
            Pricing
          </a>
          <a href="#contact" className="hidden hover:text-navy md:inline">
            Contact
          </a>
          <Link href="/login" className={secondary}>
            Log in
          </Link>
          <Link href="/register" className={primary}>
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-4 mb-6 rounded-xl bg-[linear-gradient(rgba(2,36,72,.82),rgba(2,36,72,.82)),url(/landing-bg.jpg)] bg-cover bg-center bg-no-repeat px-6 pb-[60px] pt-20 sm:px-[120px] sm:pt-[120px] lg:mx-[120px]">
        <h1 className="mb-4 max-w-[900px] text-[34px] font-bold leading-[1.15] text-white sm:text-5xl">Run your Bitcoin mining repair center from one place</h1>
        <p className="mb-7 max-w-[760px] text-lg text-[#e6edf5]">
          Manage customers, sites, technicians, jobs and spare parts in a single platform built for repair operations.
        </p>
        <div className="flex gap-2.5">
          <Link href="/register" className={primary}>
            Get started
          </Link>
          <Link href="/login" className={secondary}>
            Log in
          </Link>
        </div>
      </section>

      <section id="features" className="grid scroll-mt-20 gap-5 px-4 pb-20 md:grid-cols-3 lg:px-[120px]">
        <Feature title="Sites and stock" text="Track spare parts for every site in each country.">
          <path d="M14 18l10-5 10 5v12l-10 5-10-5z" fill="none" stroke="#006398" strokeWidth="2" />
          <path d="M14 18l10 5 10-5M24 23v12" fill="none" stroke="#006398" strokeWidth="2" />
        </Feature>
        <Feature title="Technician jobs" text="Assign jobs, record repairs and report blockers.">
          <path d="M16 32l12-12" stroke="#006398" strokeWidth="3" strokeLinecap="round" />
          <circle cx="30" cy="18" r="5" fill="none" stroke="#006398" strokeWidth="2" />
        </Feature>
        <Feature title="Customer records" text="Keep customer contacts and every device they send in.">
          <rect x="16" y="14" width="16" height="22" fill="none" stroke="#006398" strokeWidth="2" />
          <path d="M20 20h3M25 20h3M20 26h3M25 26h3M20 32h3M25 32h3" stroke="#006398" strokeWidth="2" />
        </Feature>
      </section>

      <section id="packages" className="scroll-mt-20 px-4 pb-[60px] lg:px-[120px]">
        <h2 className="mb-5 text-[28px] font-bold text-navy">Packages</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {(plans.data ?? []).map((p, i, all) => (
            <div key={p.code} className="rounded-xl border border-line bg-white p-6">
              <b className="text-lg">{p.name}</b>
              <div className="my-2 text-[28px] font-bold">{money(p.priceCents, p.currency)} / month</div>
              <ul className="my-3.5 list-disc pl-[18px] leading-[1.9] text-muted">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/register" className={`${i === all.length - 1 ? primary : secondary} mt-4 w-full`}>
                Get started
              </Link>
            </div>
          ))}
        </div>
        {plans.data && <p className="mt-3 text-xs text-muted">Prices in USD, before VAT. VAT depends on the country of your company.</p>}
      </section>

      <footer id="contact" className="mt-10 bg-navy px-4 pb-8 pt-12 text-[#c9d6e5] lg:px-[120px]">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <b className="text-lg text-white">BMERC</b>
            <p className="mt-3 max-w-[320px]">Bitcoin mining equipment repair center management, built for repair operations.</p>
          </div>
          <FootCol title="Product">
            <a href="#features" className="hover:text-white">
              Solutions
            </a>
            <a href="#packages" className="hover:text-white">
              Pricing
            </a>
          </FootCol>
          {/* Placeholder contact details from the prototype: replace with the real ones before launch. */}
          <FootCol title="Contact">
            <span>Email: hello@bmerc.example</span>
            <span>Phone: +66 00 000 0000</span>
            <span>Address: [Company address]</span>
          </FootCol>
          <FootCol title="Legal">
            <span>Privacy policy</span>
            <span>Terms of service</span>
          </FootCol>
        </div>
        <p className="mt-8 border-t border-[#1d3b5f] pt-4 text-[13px]">© 2026 BMERC.</p>
      </footer>
    </div>
  );
}

function Feature({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" className="mb-3">
        <rect width="48" height="48" rx="12" fill="#e7eefe" />
        {children}
      </svg>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="my-3.5 text-muted">{text}</p>
    </div>
  );
}

function FootCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <b className="text-white">{title}</b>
      <div className="mt-3 flex flex-col leading-8">{children}</div>
    </div>
  );
}
