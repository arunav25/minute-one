import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minute One — verified conversational onboarding",
  description:
    "A voice onboarding guide that observes the page, gives one instruction, and refuses to advance until the intended result is proven.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/png/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/brand/png/favicon-180.png", sizes: "180x180" }],
  },
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
