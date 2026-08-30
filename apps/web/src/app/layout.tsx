import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ShulStack",
    template: "%s · ShulStack",
  },
  description: "Open-source synagogue operating system",
};

type RootLayoutProps = {
  children: ReactNode;
};

// Auth and Convex providers live in app/app/layout.tsx so the landing page
// and public sites stay static and provider-free.
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
