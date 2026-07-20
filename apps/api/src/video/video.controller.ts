import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  updateHighlightsSchema,
  type UpdateHighlightsInput,
} from "@clip-lab/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JwtAuthGuard, type AuthUser } from "../auth/guards/jwt-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { VideoService } from "./video.service.js";

@ApiTags("videos")
@ApiBearerAuth()
@Controller("videos")
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videos: VideoService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.videos.list(user.id, cursor, limit ? Number(limit) : 20);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.get(user.id, id);
  }

  @Get(":id/playback-url")
  playback(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.playbackUrl(user.id, id);
  }

  @Get(":id/transcript")
  transcript(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.transcript(user.id, id);
  }

  @Get(":id/highlights")
  highlights(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.highlights(user.id, id);
  }

  @Patch(":id/highlights")
  updateHighlights(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateHighlightsSchema))
    body: UpdateHighlightsInput,
  ) {
    return this.videos.updateHighlights(user.id, id, body);
  }

  @Post(":id/highlights/retry")
  @HttpCode(202)
  retryHighlights(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.retryHighlights(user.id, id);
  }

  @Post(":id/transcript/retry")
  @HttpCode(202)
  retryTranscript(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.retryTranscript(user.id, id);
  }

  @Get(":id/clips")
  clips(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.clips(user.id, id);
  }

  @Post(":id/clips/retry")
  @HttpCode(202)
  retryClips(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.retryClips(user.id, id);
  }

  @Get(":id/clips/:clipId/playback-url")
  clipPlayback(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("clipId") clipId: string,
  ) {
    return this.videos.clipPlaybackUrl(user.id, id, clipId);
  }

  @Delete(":id/clips/:clipId")
  @HttpCode(204)
  removeClip(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("clipId") clipId: string,
  ) {
    return this.videos.removeClip(user.id, id, clipId);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.remove(user.id, id);
  }
}
