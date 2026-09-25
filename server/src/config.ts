import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  DATABASE_URL: z.string().url(),
  PVWATTS_API_KEY: z.preprocess((value) => value === "" ? undefined : value,
    z.string().min(1).optional()),
});

export type ServerConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return environmentSchema.parse(environment);
}
