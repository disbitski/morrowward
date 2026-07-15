import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Morrowward — Small steps. A future you can see.",
    template: "%s · Morrowward",
  },
  description:
    "A hopeful, private financial-future simulator for learning how small habits can compound over time.",
  applicationName: "Morrowward",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Morrowward",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    title: "Morrowward — Small steps. A future you can see.",
    description:
      "A hopeful, local-first financial future simulator and practice space.",
    siteName: "Morrowward",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Morrowward — Small steps. A future you can see.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Morrowward — Small steps. A future you can see.",
    description:
      "A hopeful, local-first financial future simulator and practice space.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
    { media: "(prefers-color-scheme: dark)", color: "#081421" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
