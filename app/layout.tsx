import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://arcpilot.vercel.app"),
  title: "ArcPilot | AI Crypto Copilot on Arc",
  description:
    "A conversational crypto copilot for Arc Network. Send USDC, review risk, and plan onchain actions through simple prompts.",
  icons: {
    icon: "/favicon.svg"
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "ArcPilot | AI Crypto Copilot on Arc",
    description:
      "Ask, review, and execute Arc Testnet USDC actions through a polished crypto copilot interface.",
    images: ["/og.svg"],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcPilot | AI Crypto Copilot on Arc",
    description:
      "Ask, review, and execute Arc Testnet USDC actions through a polished crypto copilot interface.",
    images: ["/og.svg"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
