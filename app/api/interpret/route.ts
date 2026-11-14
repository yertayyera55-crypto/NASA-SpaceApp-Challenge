import { NextResponse } from "next/server";
import { interpretationSchema, planetSchema } from "@/lib/schema";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = body as { query?: unknown; planet?: unknown };
  const planet = planetSchema.safeParse(input.planet);
  if (!planet.success || typeof input.query !== "string" || input.query.length < 8 || input.query.length > 1000) {
    return NextResponse.json({ error: "Enter a request between 8 and 1000 characters." }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Gemini is not configured. Manual filters remain available." }, { status: 503 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Interpret this scientist's request for ${planet.data} analog search: ${input.query}` }] }],
        systemInstruction: { parts: [{ text: "Return JSON only. Extract explicit numerical thresholds in degrees Celsius and mean precipitation mm/day. Never invent thresholds. Set absent values to null. Allowed missions: rover, geology, habitat, general. List requests for slope, geology, ice, dust or other unsupported data in unsupported. This is interpretation only, not scientific evidence." }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0,
          responseSchema: { type: "OBJECT", properties: {
            mission: { type: "STRING", enum: ["rover", "geology", "habitat", "general"] },
            temperatureMin: { type: "NUMBER", nullable: true },
            temperatureMax: { type: "NUMBER", nullable: true },
            precipitationMax: { type: "NUMBER", nullable: true },
            unsupported: { type: "ARRAY", items: { type: "STRING" } },
            explanation: { type: "STRING" },
          }, required: ["mission", "temperatureMin", "temperatureMax", "precipitationMax", "unsupported", "explanation"] },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({ error: "Gemini could not interpret this request. Please use manual filters." }, { status: 502 });
    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const interpreted = interpretationSchema.safeParse(JSON.parse(content));
    if (!interpreted.success) return NextResponse.json({ error: "The AI response failed validation. Please use manual filters." }, { status: 502 });
    return NextResponse.json({ interpretation: interpreted.data });
  } catch {
    return NextResponse.json({ error: "Gemini is unavailable. Please use manual filters." }, { status: 502 });
  }
}
