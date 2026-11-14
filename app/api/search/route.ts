import { NextResponse } from "next/server";
import { searchSchema } from "@/lib/schema";
import { searchAnalogs } from "@/lib/analogs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid search criteria" }, { status: 400 });
  const results = await searchAnalogs(parsed.data.criteria);
  return NextResponse.json({ results, methodology: "Relative climate suitability based only on selected, available NASA POWER variables. No geological or planetary equivalence is implied." });
}
