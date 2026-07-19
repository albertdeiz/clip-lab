export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredOptions<T> {
  model: string;
  system: string;
  user: string;
  /** Nombre del esquema/herramienta (identifica la salida estructurada). */
  schemaName: string;
  /** JSON Schema del objeto esperado (con additionalProperties:false). */
  jsonSchema: Record<string, unknown>;
  /** Valida y tipa la salida (p. ej. `(d) => zodSchema.parse(d)`). */
  validate: (data: unknown) => T;
  maxTokens?: number;
  /** Cachear el prefijo estable (soportado por Anthropic; ignorado por otros). */
  cacheSystem?: boolean;
}

export interface StructuredResult<T> {
  data: T;
  usage: TokenUsage;
  costUsd: number;
}

/**
 * Proveedor LLM agnóstico. Cada implementación (Anthropic, OpenAI-compatible,
 * …) traduce `structured()` a la API del proveedor y devuelve JSON validado.
 */
export interface LlmProvider {
  readonly name: string;
  structured<T>(opts: StructuredOptions<T>): Promise<StructuredResult<T>>;
}
