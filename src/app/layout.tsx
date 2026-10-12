import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kickback",
  description: "Payment-linked loyalty for small merchants on PayPal and Venmo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
