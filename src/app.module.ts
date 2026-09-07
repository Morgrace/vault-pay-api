import { MailerModule } from '@nestjs-modules/mailer';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Public } from './common/decorators/public.decorator';
import { CustomExceptionFilters } from './common/filters/custom-exception.filters';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionGuard } from './common/guards/session.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { appConfig } from './config';
import { DatabaseModule, DRIZZLE_DB } from './database/database.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UsersModule } from './modules/users/users.module';
import { WebhookEventsModule } from './modules/webhook-events/webhook-events.module';
import { RedisModule } from './shared/redis/redis.module';

@Public()
@Controller()
export class AppController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase) {}
  @Get('health')
  health() {
    return { status: 'ok' };
  }
  @Get('db-check')
  async checkDb() {
    try {
      await this.db.execute('SELECT 1');
      return { db: 'connected' };
    } catch (error) {
      return {
        db: 'error',
        message: (error as Error)?.message,
      };
    }
  }
}

@Module({
  imports: [
    MailerModule.forRoot(appConfig.mailer),
    DatabaseModule,
    UsersModule,
    RedisModule,
    AuthModule,
    ArticlesModule,
    AuditLogsModule,
    OrdersModule,
    WebhookEventsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: CustomExceptionFilters },

    // logging first = outermost wrapper = captures full request time
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_GUARD, useClass: SessionGuard },
    RolesGuard,
  ],
})
export class AppModule {}
