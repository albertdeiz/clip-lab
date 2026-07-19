import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClipLab",
  description: "Convierte videos largos en clips virales — competidor de OpusClip",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
