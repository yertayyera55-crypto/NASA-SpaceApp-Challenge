import type { Metadata } from "next";
import "./globals.css";
import { ExplorerProvider } from "@/components/ExplorerProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "FindY",
  description: "Explore Mars and Moon terrain and compare selected areas with potential Earth field sites.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body><ExplorerProvider><div className="app-shell"><Nav />{children}</div></ExplorerProvider></body></html>;
}
