import Link from "next/link";

const sources = [
  { name: "Mars Orbiter Laser Altimeter (MOLA)", detail: "Numerical terrain for Jezero, Gale and western Elysium Planitia.", url: "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m" },
  { name: "Lunar Orbiter Laser Altimeter (LOLA)", detail: "Numerical south-polar terrain, including Haworth and Nobile.", url: "https://pgda.gsfc.nasa.gov/products/90" },
  { name: "Copernicus DEM GLO-90", detail: "Earth terrain sampled around candidate centers at scales comparable with the selected planetary cells.", url: "https://copernicus-dem-90m.s3.amazonaws.com/readme.html" },
  { name: "NASA Mars Trek and Scientific Visualization Studio", detail: "Viking and LROC surface mosaics provide map context. The supplied geology previews are display layers.", url: "https://trek.nasa.gov/mars/" },
  { name: "NASA GIBS and NASA GSFC Scientific Visualization Studio", detail: "Blue Marble satellite imagery provides local and global Earth views. Map data credit: Reto Stöckli, NASA Goddard Space Flight Center and NASA Earth Observatory.", url: "https://svs.gsfc.nasa.gov/2915/" },
];

export default function MethodologyPage() {
  return <main className="atlas-page prose-page">
    <h1>Data sources</h1>
    <p>Explore published terrain measurements and compare a selected planetary cell with Earth patches at similar ground scales.</p>
    <section><h2>How the comparison works</h2><p>The search compares P90 slope, local relief and detrended RMS roughness. It averages the relative similarity of these measurements. The score helps shortlist field candidates. Elevation can filter the planetary map, where all values share a vertical reference. Planetary and Earth absolute elevations use different reference levels.</p></section>
    <section><h2>Coverage and limitations</h2><p>The explorer maps 112 Mars and 84 Moon cells. Earth patches cover 20 prepared windows. For 12 narrow lunar cells, the matching Earth sampling scale is unavailable. Temperature, material composition and other categories need separate georeferenced evidence. Verify site suitability and access in the field.</p></section>
    <section><h2>Source register</h2><ul className="source-list">{sources.map(source => <li key={source.name}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a><p>{source.detail}</p></li>)}</ul></section>
    <Link href="/explore" className="primary-action">Open the map</Link>
  </main>;
}
