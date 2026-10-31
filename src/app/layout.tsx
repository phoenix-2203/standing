import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Standing",
  description: "Stay in good standing with PayPal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
