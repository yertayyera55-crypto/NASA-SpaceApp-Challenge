"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false });

export default function HomePage() {
  const reduce = useReducedMotion();
  return <main className="home-page space-stage">
    <div className="stars stars-near" aria-hidden="true" /><div className="stars stars-far" aria-hidden="true" />
    <div className="home-copy">
      <motion.p className="overline" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}>NASA SPACE APPS CHALLENGE · 2026</motion.p>
      <motion.h1 initial={reduce ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .1 }}>Explore Other Worlds.<br /><em>Discover Their Earthly Twins.</em></motion.h1>
      <motion.p className="home-intro" initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .2 }}>A planetary field guide linking real Mars and Moon maps with evidence from potential Earth analog sites.</motion.p>
      <motion.div className="home-actions" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .3 }}><Link href="/select" className="primary-action">Start Exploring <ArrowRight size={19} /></Link><Link href="/methodology" className="text-action">See the data <ArrowUpRight size={17} /></Link></motion.div>
    </div>
    <div className="home-planets" aria-hidden="true"><div className="home-mars"><PlanetGlobe planet="mars" /></div></div>
    <div className="home-footerline"><span>01 / SELECT A WORLD</span><span>MARS &nbsp;·&nbsp; MOON &nbsp;→&nbsp; EARTH</span></div>
  </main>;
}
