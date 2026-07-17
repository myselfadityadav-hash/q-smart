import type { Metadata } from "next";
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
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
