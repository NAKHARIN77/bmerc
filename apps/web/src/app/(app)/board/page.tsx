import type { Metadata } from "next";
import { BoardPage } from "./board-page";

export const metadata: Metadata = { title: "Bench board" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <BoardPage />;
}
