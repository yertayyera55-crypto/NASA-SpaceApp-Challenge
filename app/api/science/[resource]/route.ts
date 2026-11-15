import { bestPatchesByRegion, type Comparison } from "@/lib/science-api";

const readRoutes: Record<string, string> = { overlays: "/api/planetary-overlays", regions: "/api/discovery-regions" };
const writeRoutes: Record<string, string> = { interpret: "/api/interpret", compare: "/api/discover/planetary-analogs" };
const MAX_PATCH_LIMIT = 15;
type Context = { params: Promise<{ resource: string }> };

async function forward(request: Request, path: string, query = "", body?: string) {
  try {
    const base = process.env.ANALOG_API_URL || "http://127.0.0.1:8000";
    const response = await fetch(new URL(path + query, base), {
      method: request.method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return Response.json({ detail: "The science API is unavailable. Try again when the service is running." }, { status: 503 });
  }
}

export async function GET(request: Request, { params }: Context) {
  const { resource } = await params;
  if (!Object.hasOwn(readRoutes, resource)) return Response.json({ detail: "Unknown data layer." }, { status: 404 });
  const body = new URL(request.url).searchParams.get("body");
  if (resource === "overlays" && body !== "mars" && body !== "moon") {
    return Response.json({ detail: "Select Mars or Moon." }, { status: 400 });
  }
  return forward(request, readRoutes[resource], resource === "overlays" ? `?body=${body}&limit=400` : "");
}

export async function POST(request: Request, { params }: Context) {
  const { resource } = await params;
  if (!Object.hasOwn(writeRoutes, resource)) return Response.json({ detail: "Unknown science operation." }, { status: 404 });
  const body = await request.text();
  const path = writeRoutes[resource];
  const response = await forward(request, path, "", body);
  if (resource !== "compare" || response.status !== 422) return response;

  const validation = await response.clone().json().catch(() => null);
  const issue = validation?.detail?.[0];
  if (validation?.detail?.length !== 1 || issue?.type !== "extra_forbidden" ||
      issue.loc?.length !== 2 || issue.loc[0] !== "body" || issue.loc[1] !== "one_per_region") return response;

  // Older comparison servers rank individual patches. Group their largest shortlist locally.
  const legacyBody = JSON.parse(body);
  if (legacyBody.one_per_region !== true) return response;
  const limit = legacyBody.limit ?? 5;
  delete legacyBody.one_per_region;
  const legacy = await forward(request, path, "", JSON.stringify({ ...legacyBody, limit: MAX_PATCH_LIMIT }));
  if (!legacy.ok) return legacy;
  const result: Comparison = await legacy.json();
  return Response.json({ ...result, candidates: bestPatchesByRegion(result.candidates).slice(0, limit) });
}
