import { z } from "zod";

export const planetSchema = z.enum(["mars", "moon"]);
export const criteriaSchema = z.object({
  temperatureMin: z.number().min(-90).max(60).nullable(),
  temperatureMax: z.number().min(-90).max(60).nullable(),
  precipitationMax: z.number().min(0).max(50).nullable(),
  mission: z.enum(["rover", "geology", "habitat", "general"]),
}).refine(v => v.temperatureMin === null || v.temperatureMax === null || v.temperatureMin <= v.temperatureMax, {
  message: "Minimum temperature must not exceed maximum temperature.",
});
export const searchSchema = z.object({
  planet: planetSchema,
  point: z.object({lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180)}).nullable(),
  criteria: criteriaSchema,
});
export const interpretationSchema = z.object({
  mission: z.enum(["rover", "geology", "habitat", "general"]),
  temperatureMin: z.number().min(-90).max(60).nullable(),
  temperatureMax: z.number().min(-90).max(60).nullable(),
  precipitationMax: z.number().min(0).max(50).nullable(),
  unsupported: z.array(z.string()).max(8),
  explanation: z.string().max(600),
});
