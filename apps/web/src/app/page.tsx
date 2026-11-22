import { redirect } from "next/navigation";

// The proxy sends visitors without a session to /login first.
export default function Home() {
  redirect("/dashboard");
}
