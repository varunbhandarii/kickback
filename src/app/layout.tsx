import type { Metadata, Viewport } from "next";
import { displayFont, monoFont, sansFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | Kickback", default: "Kickback" },
  description:
    "Payment-linked loyalty for small merchants on PayPal and Venmo.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1310" },
  ],
};

// Applies a saved light or dark choice before first paint. "System" stores nothing.
const themeScript = `(function(){try{var t=localStorage.getItem("kb-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
