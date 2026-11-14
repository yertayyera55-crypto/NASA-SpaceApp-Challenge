"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Database, Globe2, Layers3, MoveUpRight } from "lucide-react";
import { useExplorer } from "@/components/ExplorerProvider";
import type { Planet } from "@/lib/types";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false, loading: () => <div className="globe globe-placeholder" /> });

export default function LandingPage() {
  const { planet, setPlanet, setPoint } = useExplorer();
  const reduce = useReducedMotion();
  return <main className="landing-page">
    <section className="landing-hero">
      <div className="starfield" aria-hidden="true" />
      <div className="hero-horizon" aria-hidden="true" />
      <div className="hero-content">
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
          <p className="eyebrow"><span className="eyebrow-line" /> A FIELD GUIDE TO OTHER WORLDS</p>
          <h1>Explore other worlds.<br /><em>Find their Earthly twins.</em></h1>
          <p className="hero-description">A planetary research workspace connecting Mars and Moon exploration to potential field sites on Earth.</p>
          <div className="hero-actions"><Link href="/explore" className="button-primary">Start exploring <ArrowRight size={18} /></Link><Link href="/methodology" className="button-quiet">How it works <MoveUpRight size={16} /></Link></div>
        </motion.div>
      </div>
      <motion.div className="hero-planet" key={planet} initial={reduce ? false : { opacity: 0, scale: .88, x: 40 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: .9, ease: [.22, 1, .36, 1] }}>
        <PlanetGlobe planet={planet} />
        <span className="hero-planet-label"><span className="label-line" /> {planet === "mars" ? "MARS · THE RED PLANET" : "MOON · EARTH'S COMPANION"}</span>
      </motion.div>
      <div className="hero-bottom">
        <div><span className="small-label">SELECT A TARGET WORLD</span><p>Choose the surface you want to investigate.</p></div>
        <div className="planet-cards">
          {(["mars", "moon"] as Planet[]).map(target => <button key={target} className={`planet-choice ${planet === target ? "active" : ""}`} onClick={() => { setPlanet(target); setPoint(null); }} aria-pressed={planet === target}>
            <span className={`planet-mini ${target}`} /><span><strong>{target === "mars" ? "Mars" : "Moon"}</strong><small>{target === "mars" ? "Rover & geology missions" : "Lunar field preparation"}</small></span><span className="choice-radio" />
          </button>)}
        </div>
      </div>
    </section>
    <section className="landing-process">
      <div><span className="small-label">THE EXPLORATION PATH</span><h2>From a world away<br />to a place on Earth.</h2></div>
      <div className="process-list">
        <div><span>01</span><Globe2 size={23} /><strong>Explore a planet</strong><p>Rotate the NASA image globe and select a point with real spherical coordinates.</p></div>
        <div><span>02</span><Layers3 size={23} /><strong>Define conditions</strong><p>Set climate criteria. Unsupported geological layers stay visibly unavailable.</p></div>
        <div><span>03</span><Database size={23} /><strong>Compare Earth sites</strong><p>See relative scores calculated from available NASA POWER point climatology.</p></div>
      </div>
    </section>
  </main>;
}
