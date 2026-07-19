import type { Env } from "@clip-lab/config";

export type ProviderKind = "anthropic" | "openai";

interface Preset {
  kind: ProviderKind;
  baseUrl?: string;
  keyEnv?: keyof Env;
  defaultKey?: string;
}

/**
 * Presets conocidos: solo defines su API key y ya puedes seleccionarlos por
 * nombre. La mayoría son compatibles con la API de OpenAI. Para cualquier otro
 * proveedor (o self-hosted / ngrok / vLLM), usa un nombre libre + las variables
 * por-proceso <PROCESO>_BASE_URL y <PROCESO>_API_KEY.
 */
const PRESETS: Record<string, Preset> = {
  anthropic: { kind: "anthropic", keyEnv: "ANTHROPIC_API_KEY" },
  openai: { kind: "openai", baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
  deepseek: { kind: "openai", baseUrl: "https://api.deepseek.com", keyEnv: "DEEPSEEK_API_KEY" },
  moonshot: { kind: "openai", baseUrl: "https://api.moonshot.cn/v1", keyEnv: "MOONSHOT_API_KEY" },
  kimi: { kind: "openai", baseUrl: "https://api.moonshot.cn/v1", keyEnv: "MOONSHOT_API_KEY" },
  qwen: { kind: "openai", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyEnv: "DASHSCOPE_API_KEY" },
  dashscope: { kind: "openai", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyEnv: "DASHSCOPE_API_KEY" },
  groq: { kind: "openai", baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  openrouter: { kind: "openai", baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
  together: { kind: "openai", baseUrl: "https://api.together.xyz/v1", keyEnv: "TOGETHER_API_KEY" },
  ollama: { kind: "openai", baseUrl: "http://localhost:11434/v1", keyEnv: "OLLAMA_API_KEY", defaultKey: "ollama" },
};

export interface ResolvedProvider {
  provider: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Resuelve un proveedor por nombre + overrides por-proceso. Un nombre no
 * reconocido se trata como openai-compatible "custom" (base URL y key deben
 * venir por-proceso). Los overrides ganan sobre el preset.
 */
export function resolveProvider(
  provider: string,
  overrides: { baseUrl?: string; apiKey?: string },
  env: Env,
): ResolvedProvider {
  const preset = PRESETS[provider.toLowerCase()];
  const kind: ProviderKind = preset?.kind ?? "openai";
  const baseUrl = overrides.baseUrl ?? preset?.baseUrl;
  const apiKey =
    overrides.apiKey ??
    (preset?.keyEnv ? (env[preset.keyEnv] as string | undefined) : undefined) ??
    preset?.defaultKey;
  return { provider, kind, baseUrl, apiKey };
}
