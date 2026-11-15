import Link from "next/link";

export default function AboutPage() {
  return <main className="atlas-page prose-page">
    <h1>FindY</h1>
    <p>An independent NASA Space Apps Challenge project. The explorer helps researchers use measured Mars and Moon terrain to shortlist areas for field research on Earth.</p>
    <section><h2>From map to field candidate</h2><p>Choose a world and filter its surveyed terrain. Then select a measured cell to compare slope, relief and roughness against Earth patches. Each result shows the measurements side by side and links to their sources.</p></section>
    <Link href="/select" className="primary-action">Choose a world</Link>
  </main>;
}
