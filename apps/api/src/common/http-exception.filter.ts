import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

/**
 * Da forma uniforme a los errores: { error: { code, message, details? } }.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Error interno";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
        code = codeFromStatus(status);
      } else if (res && typeof res === "object") {
        const body = res as Record<string, unknown>;
        code = (body.code as string) ?? codeFromStatus(status);
        message =
          (body.message as string) ??
          (Array.isArray(body.message)
            ? (body.message as string[]).join(", ")
            : codeFromStatus(status));
        details = body.details;
      }
    } else {
      this.logger.error(exception);
    }

    void reply.status(status).send({ error: { code, message, details } });
  }
}

function codeFromStatus(status: number): string {
  return (
    {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      429: "RATE_LIMITED",
    }[status] ?? "ERROR"
  );
}
