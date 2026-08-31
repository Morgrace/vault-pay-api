import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Joi from 'joi';
import { CustomExceptionFilters } from './common/filters/custom-exception.filters';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionGuard } from './common/guards/session.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { appConfig } from './config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule, DRIZZLE_DB } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { Public } from './common/decorators/public.decorator';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { OrdersModule } from './modules/orders/orders.module';

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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
      validationSchema: Joi.object({
        // App
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),

        // Database [PostgreSQL]
        DB_HOST: Joi.string().default('localhost'),
        DB_PORT: Joi.number().default(5432),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_NAME: Joi.string().required(),

        // Redis
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),

        // RabbitMQ [Advanced Message Queuing Protocol]
        RABBITMQ_URL: Joi.string().default('amqp://localhost:5672'),

        // Paystack
        // PAYSTACK_SECRET_KEY: Joi.string().required(),

        //  [Email Service]
        MAIL_HOST: Joi.string().required(),
        MAIL_PORT: Joi.number().default(465),
        MAIL_USER: Joi.string().required(),
        MAIL_PASS: Joi.string().required(),
        MAIL_FROM: Joi.string().email().required(),

        // OAuth [Open Authorization] - Google
        // GOOGLE_CLIENT_ID: Joi.string().required(),
        // GOOGLE_CLIENT_SECRET: Joi.string().required(),
        // GOOGLE_CALLBACK_URL: Joi.string().uri().required(),

        // OAuth [Open Authorization] - GitHub
        // GITHUB_CLIENT_ID: Joi.string().required(),
        // GITHUB_CLIENT_SECRET: Joi.string().required(),
        // GITHUB_CALLBACK_URL: Joi.string().uri().required(),
      }),
    }),
    DatabaseModule,
    UsersModule,
    RedisModule,
    AuthModule,
    ArticlesModule,
    AuditLogsModule,
    OrdersModule,
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
