import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FX Remit – Send Money Across Africa",
  description: "Instant, global crypto-to-fiat remittances. Send USDC to Nigeria, Ghana, Kenya and 15+ countries via blockchain in under 2 minutes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FX Remit",
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-[430px] mx-auto min-h-screen relative overflow-hidden bg-white">
          {children}
        </div>
      </body>
    </html>
  );
}
