import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="editorial-page">
      <div className="editorial-kicker">ABOUT THE PROJECT / NASA SPACE APPS 2026</div>
      <h1>From Planetary Cartography<br />to Terrestrial Field Sites.</h1>
      <p className="editorial-lede">
        Planetary Analog Explorer is an open-access scientific tool developed for the NASA Space Apps Challenge 2026.
        It enables researchers to inspect authentic Mars and Moon surface cartography, formulate mission-critical environmental criteria, and evaluate a verified shortlist of candidate Earth field testing grounds using traceable NASA climatological datasets.
      </p>

      <div className="editorial-rule" />

      <div className="editorial-columns">
        <section>
          <span>CORE MISSION</span>
          <h2>Scientific Legibility & Ground Truth</h2>
          <p>
            In space exploration software, transparency is paramount. Rather than generating synthetic predictions or superficial AI visuals, every coordinate, parameter, and suitability score in this system is linked directly to published NASA datasets.
          </p>
          <p>
            The interface maintains a clear, uncompromising distinction between visual cartographic navigation and calibrated numerical measurements.
          </p>
        </section>

        <section>
          <span>DATA ARCHITECTURE</span>
          <h2>Climatological Evidence Baseline</h2>
          <p>
            Earth analog scoring is powered by server-side integration with NASA POWER (Prediction Of Worldwide Energy Resources) climatology covering the 2001–2020 20-year baseline.
          </p>
          <p>
            Planetary surface textures are served directly from NASA Mars Trek Viking global color mosaics and NASA SVS Lunar Reconnaissance Orbiter (LROC) WAC basemaps. Earth context is provided by NASA GIBS Blue Marble Next Generation imagery.
          </p>
        </section>
      </div>

      <div className="editorial-actions">
        <Link href="/select" className="primary-action">
          Explore the Worlds <ArrowRight size={16} />
        </Link>
        <a
          href="https://github.com/yertayyera55-crypto/NASA-SpaceApp-Challenge"
          target="_blank"
          rel="noreferrer"
          className="text-action"
        >
          Project Repository <ArrowUpRight size={15} />
        </a>
      </div>
    </main>
  );
}
