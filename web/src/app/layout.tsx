import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manzil OS — Society cashbook, without the spreadsheet",
  description:
    "Track what you collected, what you spent, and what’s left — all in one place. No spreadsheets.",
  openGraph: {
    title: "Manzil OS — Society cashbook",
    description: "Track what you collected, what you spent, and what’s left — all in one place.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
