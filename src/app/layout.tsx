import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Q-Smart — Real-Time Virtual Queuing",
  description:
    "Q-Smart replaces physical queues with a real-time virtual queue. Customers scan a QR code to join; tellers manage the line from a live dashboard.",
  keywords: ["Q-Smart", "virtual queue", "queue management", "real-time", "Next.js", "Socket.IO"],
  authors: [{ name: "Q-Smart" }],
  manifest: "/manifest.json",
  applicationName: "Q-Smart",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Q-Smart",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: ["/favicon.svg"],
  },
  openGraph: {
    title: "Q-Smart — Real-Time Virtual Queuing",
    description: "Scan, join, and wait anywhere. Live positions and smart ETAs.",
    siteName: "Q-Smart",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Q-Smart — Real-Time Virtual Queuing",
    description: "Scan, join, and wait anywhere. Live positions and smart ETAs.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apple PWA meta tags (kept here for explicit control across iOS versions) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Q-Smart" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
