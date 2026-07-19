import { Global, Module } from "@nestjs/common";
import { loadEnv, type Env } from "@clip-lab/config";

export const ENV = Symbol("ENV");

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
