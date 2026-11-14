"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Orbit } from "lucide-react";

export function Nav() {
  const path = usePathname();
  return <header className="site-nav">
    <Link href="/" className="brand" aria-label="Planetary Analog Explorer home"><span className="brand-mark"><Orbit size={31} strokeWidth={1.35} /></span><span>Planetary Analog <em>Explorer</em></span></Link>
    <nav aria-label="Primary navigation">
      <Link className={path === "/" || path === "/select" || path === "/explore" ? "active" : ""} href="/select">Explore</Link>
      <Link className={path === "/results" ? "active" : ""} href="/results">Find Analogs</Link>
      <Link className={path === "/methodology" ? "active" : ""} href="/methodology">Data Sources</Link>
      <Link className={path === "/about" ? "active" : ""} href="/about">About</Link>
    </nav>
    <span className="nav-profile" aria-hidden="true"><CircleUserRound size={23} strokeWidth={1.5} /></span>
  </header>;
}
