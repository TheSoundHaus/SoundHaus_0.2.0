import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SoundHaus",
  description: "The Git for Music",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
