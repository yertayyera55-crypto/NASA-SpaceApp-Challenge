"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orbit } from "lucide-react";

const sections = [
  { href: "/select", name: "Explore", paths: ["/select", "/explore"] },
  { href: "/results", name: "Earth analogs", paths: ["/results"] },
  { href: "/methodology", name: "Data sources", paths: ["/methodology"] },
  { href: "/about", name: "About", paths: ["/about"] },
];

export function Nav() {
  const path = usePathname();
  return <header className="site-nav">
    <Link href="/" className="brand" aria-label="FindY home"><Orbit size={26} strokeWidth={1.4} /><span>FindY</span></Link>
    <nav aria-label="Primary navigation">{sections.map(section => <Link key={section.href} href={section.href} aria-current={section.paths.includes(path) ? "page" : undefined}>{section.name}</Link>)}</nav>
  </header>;
}
