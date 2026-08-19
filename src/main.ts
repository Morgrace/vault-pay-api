import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { appConfig } from './config';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    const { port, apiPrefix } = appConfig().app;

    app.setGlobalPrefix(apiPrefix, {
      exclude: ['health', 'metrics'],
    });

    app.enableShutdownHooks();

    app.use(cookieParser());

    await app.listen(port ?? 3000);
  } catch (error) {
    console.error('🔥 Error during application bootstrap', error);
    process.exit(1);
  }
}

void bootstrap();
