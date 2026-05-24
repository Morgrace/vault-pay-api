import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export const DRIZZLE_DB = 'DRiZZLE_DB';
const POSTGRES_CLIENT = 'POSTGRES_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return postgres({
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          user: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          max: 10,
          idle_timeout: 20,
          max_lifetime: 900,
        });
      },
    },
    {
      provide: DRIZZLE_DB,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: postgres.Sql) => {
        return drizzle(client, { schema, logger: true });
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(POSTGRES_CLIENT)
    private readonly postgresClient: postgres.Sql,
  ) {}

  async onModuleDestroy() {
    await this.postgresClient.end();
  }
}
