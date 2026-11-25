import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <Doc title="Terms of Service">
      <p className="text-sm text-muted">
        Effective {LEGAL.effective} · Version {LEGAL.version}
      </p>
      <p>
        These terms are an agreement between {LEGAL.operator} ({LEGAL.legalName}, &quot;we&quot;) and the company that registers for BMERC (&quot;you&quot;). By creating an account you agree to
        them on behalf of your company.
      </p>

      <h2>1. The service</h2>
      <p>
        BMERC is software for repair centers that fix Bitcoin mining equipment: receiving devices, assigning jobs, recording tests and parts, stock, invoices and reports. We provide it
        online as a subscription.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>The person who registers becomes your company admin and is responsible for the staff accounts they create.</li>
        <li>Keep passwords secret. Each person needs their own account; do not share sign-ins.</li>
        <li>Tell us straight away if you think an account has been misused.</li>
      </ul>

      <h2>3. Plans and credits</h2>
      <ul>
        <li>Each plan includes a number of credits per month, and limits on sites and users, as shown on the pricing page when you buy.</li>
        <li>A job uses credits when it passes QC, by work type. The credits per work type are shown before you buy and stay fixed for your company while you keep that plan.</li>
        <li>Jobs that cannot be repaired or are cancelled use no credits. The same device repaired again within 7 days counts once.</li>
        <li>Credits reset at the start of each month and do not carry over. When they run out, you cannot receive new devices until the next month or until you upgrade; jobs already received can be finished.</li>
      </ul>

      <h2>4. Prices and payment</h2>
      <ul>
        <li>Prices are in US dollars, before VAT. VAT is added according to your company&apos;s country.</li>
        <li>Plans are billed in advance for each period. Pay each invoice by its due date by the methods shown in the app.</li>
        <li>If an invoice stays unpaid after the due date, we may suspend your account. Your data is kept, and the account is restored when the invoice is paid.</li>
        <li>Fees already paid are not refunded, unless the law requires it.</li>
      </ul>

      <h2>5. Your data</h2>
      <ul>
        <li>The data you enter (customers, devices, jobs, parts, stock, invoices) belongs to you. You are responsible for having the right to enter it, including your customers&apos; personal data.</li>
        <li>We process it only to provide the service, as described in our <Link href="/privacy" className="font-semibold text-info hover:underline">Privacy Policy</Link>.</li>
        <li>You can ask for a copy of your data at any time, and when you close your account.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>try to access another company&apos;s data or break the service&apos;s security;</li>
        <li>overload the service on purpose, or use it to send spam or unlawful content;</li>
        <li>resell or copy the software without our written permission.</li>
      </ul>

      <h2>7. Availability and changes</h2>
      <ul>
        <li>We work to keep BMERC available and back up data regularly, but we do not promise uninterrupted service. Planned maintenance is announced in advance where possible.</li>
        <li>We may improve or change features. If a change removes something important to your plan, we will tell you beforehand.</li>
      </ul>

      <h2>8. Liability</h2>
      <p>
        The service is provided as it is. As far as the law allows, we are not liable for indirect losses such as lost profit, and our total liability for any claim is limited to the
        fees you paid us in the 12 months before the claim.
      </p>

      <h2>9. Ending the agreement</h2>
      <ul>
        <li>You can stop using BMERC at any time. Your plan runs until the end of the period already paid.</li>
        <li>We may end or suspend an account that breaks these terms.</li>
        <li>After an account is closed, data is handled as described in the Privacy Policy.</li>
      </ul>

      <h2>10. Changes to these terms</h2>
      <p>We will tell company admins before changes take effect. If you keep using BMERC after that, the new terms apply.</p>

      <h2>11. Law</h2>
      <p>These terms are governed by the laws of Thailand, and the courts of Thailand decide any dispute.</p>

      <h2>12. Contact</h2>
      <p>
        {LEGAL.legalName}, {LEGAL.address}
        <br />
        Email: {LEGAL.contactEmail}
      </p>
    </Doc>
  );
}
