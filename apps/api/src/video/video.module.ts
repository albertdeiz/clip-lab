import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { VideoController } from "./video.controller.js";
import { VideoService } from "./video.service.js";

@Module({
  imports: [AuthModule],
  controllers: [VideoController],
  providers: [VideoService],
})
export class VideoModule {}
