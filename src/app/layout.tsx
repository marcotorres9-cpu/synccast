import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { UpdateNotification } from "@/components/update-notification";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyncCast - Multi-TV Video & Music Sync",
  description: "Sincroniza videos y música entre múltiples televisores simultáneamente. Compatible con Android.",
  keywords: ["sync", "multi-TV", "video", "music", "playlist", "Android", "PWA"],
  authors: [{ name: "SyncCast" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SyncCast",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: "SyncCast - Multi-TV Sync",
    description: "Sincroniza videos y música en múltiples TVs",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a0b2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <UpdateManagerClient />
      </body>
    </html>
  );
}
