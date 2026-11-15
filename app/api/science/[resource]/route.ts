const readRoutes: Record<string, string> = { overlays: "/api/planetary-overlays", regions: "/api/discovery-regions" };
const writeRoutes: Record<string, string> = { interpret: "/api/interpret", compare: "/api/discover/planetary-analogs" };
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
  return forward(request, writeRoutes[resource], "", await request.text());
}
