import { z } from "zod";

/**
 * Esquema de entorno validado al boot. Falla rápido si falta o es inválida
 * alguna variable crítica — nunca arrancamos con configuración incompleta.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z
    .string()
    .url()
    .default("amqp://cliplab:cliplab@localhost:5672"),

  // --- Credenciales de proveedores de IA (define solo las que uses) ---
  // Presets conocidos leen su key de estas variables; para proveedores
  // arbitrarios/self-hosted usa las variables por-proceso *_API_KEY / *_BASE_URL.
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  MOONSHOT_API_KEY: z.string().optional(), // Kimi
  DASHSCOPE_API_KEY: z.string().optional(), // Qwen (Alibaba)
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),

  // --- Proceso: transcripción ---
  // provider: 'faster-whisper' | cualquier preset openai-compatible | 'custom'
  TRANSCRIPTION_PROVIDER: z.string().default("faster-whisper"),
  WHISPER_MODEL: z.string().default("base"), // faster-whisper
  TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  TRANSCRIPTION_BASE_URL: z.string().url().optional(), // override / custom
  TRANSCRIPTION_API_KEY: z.string().optional(), // override / custom

  // --- Proceso: highlights (análisis local por chunk) ---
  HIGHLIGHT_LOCAL_PROVIDER: z.string().default("anthropic"),
  HIGHLIGHT_LOCAL_MODEL: z.string().default("claude-haiku-4-5"),
  HIGHLIGHT_LOCAL_BASE_URL: z.string().url().optional(),
  HIGHLIGHT_LOCAL_API_KEY: z.string().optional(),

  // --- Proceso: highlights (rerank global) ---
  HIGHLIGHT_GLOBAL_PROVIDER: z.string().default("anthropic"),
  HIGHLIGHT_GLOBAL_MODEL: z.string().default("claude-sonnet-5"),
  HIGHLIGHT_GLOBAL_BASE_URL: z.string().url().optional(),
  HIGHLIGHT_GLOBAL_API_KEY: z.string().optional(),

  CHUNK_SECONDS: z.coerce.number().int().positive().default(150),
  CHUNK_OVERLAP_SECONDS: z.coerce.number().int().nonnegative().default(20),
  HIGHLIGHTS_TARGET: z.coerce.number().int().positive().default(10),
  // Cortes coherentes: los highlights se ajustan a frases completas y a esta
  // duración objetivo (segundos); las frases se separan por puntuación o pausa.
  HIGHLIGHT_MIN_SEC: z.coerce.number().positive().default(15),
  HIGHLIGHT_MAX_SEC: z.coerce.number().positive().default(90),
  SENTENCE_PAUSE_SEC: z.coerce.number().positive().default(0.8),

  // --- Proceso: generación de clips (FFmpeg) ---
  CLIP_REFRAME: z.enum(["crop", "blur", "fit"]).default("crop"),
  CLIP_WIDTH: z.coerce.number().int().positive().default(1080),
  CLIP_HEIGHT: z.coerce.number().int().positive().default(1920),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  MAX_STORAGE_PER_USER: z.coerce.number().int().positive().default(53_687_091_200),
  MAX_UPLOAD_SIZE: z.coerce.number().int().positive().default(2_147_483_648),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}
