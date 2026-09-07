import 'dotenv/config';
import { MailerOptions } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

type AppServiceConfig = {
  port: number;
  authRedirectUrl: string | undefined;
  env: string;
  apiPrefix: string;
  clientUrl: string | undefined;
};

type DatabaseServiceConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

type RedisServiceConfig = {
  host: string;
  port: number;
};

type RabbitMQServiceConfig = {
  urls: string[];
};

type PaystackServiceConfig = {
  secretKey: string | undefined;
};

type GoogleOAuthConfig = {
  clientID: string | undefined;
  clientSecret: string | undefined;
  callbackURL: string | undefined;
};

type GithubOAuthConfig = {
  clientID: string | undefined;
  clientSecret: string | undefined;
  callbackURL: string | undefined;
};

type OAuthServiceConfig = {
  google: GoogleOAuthConfig;
  github: GithubOAuthConfig;
};

type AppConfig = {
  app: AppServiceConfig;
  database: DatabaseServiceConfig;
  redis: RedisServiceConfig;
  rabbitmq: RabbitMQServiceConfig;
  paystack: PaystackServiceConfig;
  mailer: MailerOptions;
  oauth: OAuthServiceConfig;
};

const mailPort = Number.parseInt(process.env.MAIL_PORT || '587', 10);

export const appConfig: AppConfig = {
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    authRedirectUrl: process.env.AUTH_REDIRECT_URL,
    env: process.env.NODE_ENV || 'development',
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    clientUrl: process.env.CLIENT_URL,
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'vaultpay',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  rabbitmq: {
    urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
  },
  mailer: {
    transport: {
      host: process.env.MAIL_HOST,
      port: mailPort,
      service: process.env.MAIL_SERVICE,
      secure: mailPort === 465,
      requireTLS: mailPort !== 465,
      pool: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    },
    defaults: {
      from: process.env.MAIL_FROM,
    },
    template: {
      dir: `${process.cwd()}/dist/email-templates/`,
      adapter: new HandlebarsAdapter(),
      options: {
        strict: true,
      },
    },
  },
  oauth: {
    google: {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    github: {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
    },
  },
};
