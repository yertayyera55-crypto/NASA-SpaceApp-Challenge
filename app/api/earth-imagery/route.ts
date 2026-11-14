import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 88 || Math.abs(lon) > 177) {
    return NextResponse.json({ error: "Invalid map point" }, { status: 400 });
  }
  const bbox = [lon - 3, lat - 1.65, lon + 3, lat + 1.65].join(",");
  const params = new URLSearchParams({ SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap", LAYERS: "BlueMarble_NextGeneration", STYLES: "", FORMAT: "image/jpeg", SRS: "EPSG:4326", BBOX: bbox, WIDTH: "1200", HEIGHT: "660" });
  try {
    const response = await fetch(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("image/jpeg")) throw new Error("GIBS unavailable");
    return new Response(await response.arrayBuffer(), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "NASA GIBS imagery unavailable" }, { status: 502 });
  }
}
