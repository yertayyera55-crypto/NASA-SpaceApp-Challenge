"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { MarsTerrain } from "@/components/effects/MarsTerrain";

const PlanetGlobe = dynamic(() => import("@/components/PlanetGlobe"), { ssr: false });

export default function HomePage() {
  const reduce = useReducedMotion();

  return (
    <main className="home-page space-stage">
      <MarsTerrain className="mars-terrain-home" />

      <div className="home-copy">
        <motion.p
          className="overline"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          NASA Space Apps Challenge 2026
        </motion.p>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Explore Other Worlds.<br />
          <em>Discover Their Earthly Twins.</em>
        </motion.h1>

        <motion.p
          className="home-intro"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          A planetary research guide connecting authentic Mars and Moon surface cartography
          with candidate Earth analog field sites.
        </motion.p>

        <motion.div
          className="home-actions"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link href="/select" className="primary-action">
            Start Exploring <ArrowRight size={16} />
          </Link>
          <Link href="/methodology" className="text-action">
            See the data <ArrowUpRight size={15} />
          </Link>
        </motion.div>
      </div>

      <div className="home-planets" aria-hidden="true">
        <div className="home-mars">
          <PlanetGlobe planet="mars" />
        </div>
      </div>
    </main>
  );
}
