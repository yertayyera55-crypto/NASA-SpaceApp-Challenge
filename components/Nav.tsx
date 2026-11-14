"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Orbit } from "lucide-react";
import { useExplorer } from "./ExplorerProvider";

export function Nav() {
  const path = usePathname();
  const { planet, setPlanet, setPoint } = useExplorer();
  return <header className="site-nav">
    <Link href="/" className="brand" aria-label="Planetary Analog Explorer home"><span className="brand-mark"><Orbit size={20} strokeWidth={1.5} /></span><span>PLANETARY<br /><strong>ANALOG EXPLORER</strong></span></Link>
    <nav aria-label="Primary navigation">
      <Link className={path === "/explore" ? "active" : ""} href="/explore">Explore</Link>
      <Link className={path === "/results" ? "active" : ""} href="/results">Earth analogs</Link>
      <Link className={path === "/methodology" ? "active" : ""} href="/methodology">Methodology</Link>
    </nav>
    <div className="nav-right">
      <div className="planet-switch" aria-label="Select target world">
        <button className={planet === "mars" ? "selected" : ""} onClick={() => { setPlanet("mars"); setPoint(null); }}>Mars</button>
        <button className={planet === "moon" ? "selected" : ""} onClick={() => { setPlanet("moon"); setPoint(null); }}>Moon</button>
      </div>
      <a className="nav-github" href="https://github.com/yertayyera55-crypto/NASA-SpaceApp-Challenge" target="_blank" rel="noreferrer" aria-label="GitHub repository"><ArrowUpRight size={17} /></a>
    </div>
  </header>;
}
