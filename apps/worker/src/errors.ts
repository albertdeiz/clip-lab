/**
 * Error que NO debe reintentarse automáticamente (config inválida, datos
 * corruptos, input no válido). Reintentar no lo arregla → va directo a la DLQ.
 * El resto de errores se consideran transitorios y sí se reintentan con backoff.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}
