import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GoogleService } from "./google.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RateLimitGuard } from "./guards/rate-limit.guard.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: "HS256" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleService, JwtAuthGuard, RateLimitGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
