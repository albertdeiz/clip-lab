import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createUploadSchema,
  signPartSchema,
  completeUploadSchema,
  type CreateUploadInput,
  type SignPartInput,
  type CompleteUploadInput,
} from "@clip-lab/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JwtAuthGuard, type AuthUser } from "../auth/guards/jwt-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { UploadService } from "./upload.service.js";

@ApiTags("uploads")
@ApiBearerAuth()
@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUploadSchema)) body: CreateUploadInput,
  ) {
    return this.uploads.createUpload(user.id, body);
  }

  @Post(":id/parts")
  @HttpCode(200)
  signPart(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signPartSchema)) body: SignPartInput,
  ) {
    return this.uploads.signPart(user.id, id, body.partNumber);
  }

  @Post(":id/complete")
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeUploadSchema)) body: CompleteUploadInput,
  ) {
    return this.uploads.complete(user.id, id, body);
  }

  @Post(":id/abort")
  @HttpCode(204)
  abort(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.uploads.abort(user.id, id);
  }
}
