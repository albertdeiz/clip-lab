import {
  type ArgumentMetadata,
  BadRequestException,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodTypeAny } from "zod";

/**
 * Valida el body/param contra un esquema Zod de @clip-lab/contracts.
 * Mantiene los contratos como única fuente de verdad FE/BE.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La solicitud no es válida",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
