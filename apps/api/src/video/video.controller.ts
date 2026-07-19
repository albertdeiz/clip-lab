import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.videos.remove(user.id, id);
  }
}
