import type { Metadata } from "next";
import "./globals.css";
import { ExplorerProvider } from "@/components/ExplorerProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Planetary Analog Explorer",
  description: "Explore real Mars and Moon maps, then compare Earth field sites with transparent NASA climate evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body><ExplorerProvider><div className="app-shell"><Nav />{children}</div></ExplorerProvider></body></html>;
}
