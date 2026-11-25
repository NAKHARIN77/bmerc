import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Doc title="Privacy Policy">
      <p className="text-sm text-muted">
        Effective {LEGAL.effective} · Version {LEGAL.version}
      </p>
      <p>
        This policy explains how {LEGAL.operator} ({LEGAL.legalName}, &quot;we&quot;) handles personal data when repair centers use the BMERC software, in line with
        Thailand&apos;s Personal Data Protection Act B.E. 2562 (PDPA).
      </p>

      <h2>1. Who is responsible for which data</h2>
      <ul>
        <li>
          <b>Your account data</b> (the people who sign in, and the company that subscribes): we decide how it is used, so we are the <b>data controller</b>.
        </li>
        <li>
          <b>Data a repair center enters about its own customers and work</b> (customer names and contact details, devices, serial numbers, jobs, parts, stock and invoices): the repair
          center is the data controller. We are the <b>data processor</b> and only store and process it to run the service for that repair center.
        </li>
        <li>
          We do not read a repair center&apos;s customers, jobs, parts or stock. Our platform staff see only company details, plans, billing and usage counts. This is enforced in the
          database, not just in the screens.
        </li>
      </ul>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <b>Account:</b> full name, work email, role, the sites and team you belong to, and a password stored only as a one-way hash.
        </li>
        <li>
          <b>Company and billing:</b> company name, country, billing email and address, tax ID if given, plan, invoices and the payment slips you upload.
        </li>
        <li>
          <b>Security and usage logs:</b> sign-ins, failed sign-ins, IP address, and an audit log of important actions (for example who changed a job, approved a part or viewed
          sensitive records).
        </li>
        <li>
          <b>Repair data</b> entered by the repair center, as described in section 1.
        </li>
      </ul>

      <h2>3. Why we use it, and on what legal basis</h2>
      <ul>
        <li>
          To provide the service you signed up for: accounts, sign-in, jobs, stock and reports (<b>contract</b>).
        </li>
        <li>
          To bill your plan and keep accounting records (<b>contract</b> and <b>legal obligation</b>, for example tax law).
        </li>
        <li>
          To keep the service secure, detect misuse and investigate problems (<b>legitimate interest</b>).
        </li>
        <li>To send service emails such as invitations, password resets and billing notices (contract). We do not send marketing email without your consent.</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>We do not sell personal data. We share it only with providers that help us run the service, under contracts that require them to protect it:</p>
      <ul>
        <li>Hosting and database: {LEGAL.hosting}.</li>
        <li>Email delivery, for service emails.</li>
        <li>Payment providers, when you pay by a method that uses one.</li>
        <li>Authorities, when the law requires it.</li>
      </ul>

      <h2>5. Data stored outside Thailand</h2>
      <p>
        Our servers are run by {LEGAL.hosting}. When data is transferred outside Thailand we rely on the safeguards the PDPA allows, such as contractual protections with the provider.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Account and repair data: while the company&apos;s subscription is active. If a subscription is suspended, data is kept so the company can continue after paying.</li>
        <li>After a company closes its account, we delete or anonymise its data within 90 days, except what we must keep by law.</li>
        <li>Invoices and payment records: as long as accounting and tax law requires (usually 5 years in Thailand).</li>
        <li>Security logs: up to 1 year.</li>
      </ul>

      <h2>7. How we protect it</h2>
      <ul>
        <li>Encrypted connections (HTTPS) for all traffic.</li>
        <li>Each company&apos;s data is separated in the database (row-level security), so one company cannot see another&apos;s.</li>
        <li>Access by role: each person sees only what their role and sites allow.</li>
        <li>Passwords stored as one-way hashes; audit logs of important actions; regular backups.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>Under the PDPA you may ask us to:</p>
      <ul>
        <li>give you access to or a copy of your personal data, or send it to another provider;</li>
        <li>correct data that is wrong or incomplete;</li>
        <li>delete or anonymise data, or restrict how it is used;</li>
        <li>stop using it where we rely on legitimate interest;</li>
        <li>withdraw consent where we rely on consent.</li>
      </ul>
      <p>
        If you are a customer of a repair center, please contact that repair center first, because it controls your data. We will help it answer your request. You may also complain to
        Thailand&apos;s Personal Data Protection Committee (PDPC).
      </p>

      <h2>9. Cookies</h2>
      <p>We use only the cookies needed to keep you signed in securely. We do not use advertising or tracking cookies.</p>

      <h2>10. Changes to this policy</h2>
      <p>If we change this policy in a way that matters, we will tell company admins by email or in the app before the change takes effect. The version and date are shown at the top.</p>

      <h2>11. Contact</h2>
      <p>
        {LEGAL.legalName}, {LEGAL.address}
        <br />
        Email: {LEGAL.contactEmail}
      </p>
      <p className="text-sm text-muted">
        See also our <Link href="/terms" className="font-semibold text-info hover:underline">Terms of Service</Link>.
      </p>
    </Doc>
  );
}
