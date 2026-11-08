import type { Metadata } from "next";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "Components", robots: { index: false } };

// The component library on one page, for design review. Not linked from the app; example content only.
export default function StyleguidePage() {
  return <Gallery />;
}
