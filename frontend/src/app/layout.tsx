import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBKR Portfolio Dashboard",
  description: "Portfolio allocation, ticker news, and X posts in one view.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
