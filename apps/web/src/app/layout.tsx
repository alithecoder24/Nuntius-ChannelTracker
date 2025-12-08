import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nuntius — Channel Tracker",
  description: "Track and analyze YouTube channels for niche research",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%231a1225'/%3E%3Cstop offset='100%25' stop-color='%230d0a12'/%3E%3C/linearGradient%3E%3ClinearGradient id='n' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23e879f9'/%3E%3Cstop offset='50%25' stop-color='%23c084fc'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3ClinearGradient id='shine' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff' stop-opacity='0.15'/%3E%3Cstop offset='50%25' stop-color='%23ffffff' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' rx='22' fill='url(%23bg)'/%3E%3Crect x='2' y='2' width='96' height='96' rx='20' fill='none' stroke='%23a855f7' stroke-opacity='0.3'/%3E%3Crect x='4' y='4' width='92' height='46' rx='18' fill='url(%23shine)'/%3E%3Ctext x='50' y='70' font-family='system-ui,sans-serif' font-size='52' font-weight='700' fill='url(%23n)' text-anchor='middle'%3EN%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
