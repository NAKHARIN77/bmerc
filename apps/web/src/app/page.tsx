import type { Metadata } from "next";
import { Landing } from "@/components/landing";

export const metadata: Metadata = { title: { absolute: "BMERC · Bitcoin mining repair center software" } };

// Public landing page. Signed-in visitors are sent to /dashboard by the proxy.
export default function Home() {
  return <Landing />;
}
