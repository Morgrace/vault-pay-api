import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { appConfig } from '../config';

export const DRIZZLE_DB = 'DRIZZLE_DB';
const POSTGRES_CLIENT = 'POSTGRES_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      useFactory: () => {
        return postgres({
          host: appConfig.database.host,
          port: appConfig.database.port,
          user: appConfig.database.username,
          password: appConfig.database.password,
          database: appConfig.database.database,
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
