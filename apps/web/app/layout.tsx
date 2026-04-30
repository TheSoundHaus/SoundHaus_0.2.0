import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/** UI sans — replaces default Inter stack; see docs/ui-redesign-plan.md Phase A */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SoundHaus",
  description: "The Git for Music",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={sans.variable}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
