import type { Metadata, Viewport } from "next";
import { Cormorant, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Display: a thin, airy, high-contrast serif for huge weight-inverted heroes
// (hero = 300 hairline; section heads = 600). Ethereal, dreamlike — not a
// system face. Exposed as --font-display-face; globals maps it to --font-display.
const display = Cormorant({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

// Body/UI: a clean, slightly warm geometric grotesk with excellent small-size
// legibility — the grounded counterweight to the hairline display.
const sans = Hanken_Grotesk({
  variable: "--font-sans-face",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Oneiro",
    template: "%s · Oneiro",
  },
  description:
    "Speak a dream and wander it. Oneiro turns spoken dreams into navigable, psychedelic 3D worlds you can collect, revisit, and gift.",
  applicationName: "Oneiro",
  keywords: [
    "dream journal",
    "dreams",
    "3D",
    "psychedelic",
    "voice",
    "generative",
  ],
  authors: [{ name: "Oneiro" }],
  openGraph: {
    title: "Oneiro",
    description:
      "Speak a dream and wander it — a dream journal that becomes a navigable psychedelic 3D world.",
    siteName: "Oneiro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oneiro",
    description:
      "Speak a dream and wander it — a dream journal that becomes a navigable psychedelic 3D world.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0b10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-void text-haze font-sans selection:bg-neon-gold selection:text-void">
        {children}
      </body>
    </html>
  );
}
