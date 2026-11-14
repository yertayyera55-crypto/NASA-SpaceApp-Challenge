import type { Metadata } from "next";
import "./globals.css";
import { ExplorerProvider } from "@/components/ExplorerProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Planetary Analog Explorer",
  description: "Explore Mars and Moon, then compare Earth field sites using transparent NASA climate evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ExplorerProvider><div className="app-shell"><Nav />{children}<footer className="site-footer"><span>PLANETARY ANALOG EXPLORER · NASA SPACE APPS 2026</span><span>Independent hackathon project. NASA imagery and POWER data credited in Methodology.</span></footer></div></ExplorerProvider></body></html>;
}
