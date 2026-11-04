import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist_Mono, Manrope, Unbounded } from "next/font/google";
import "./globals.css";

// Unbounded — заголовки і слова на картках, Manrope — текст; обидва з кирилицею
const display = Unbounded({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "English with AI",
  description: "Англійська під тебе: тест рівня, картки з інтервальним повторенням, розмова з AI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // telegram-web-app.js ставить style на <html> до гідрації
    <html lang="uk" suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className={`${display.variable} ${body.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
