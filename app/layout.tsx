import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minute One — verified conversational onboarding",
  description:
    "A voice onboarding guide that observes the page, gives one instruction, and refuses to advance until the intended result is proven.",
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
