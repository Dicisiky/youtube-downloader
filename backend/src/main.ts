import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);

  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());

  app.enableCors({
    // 'corsOrigin' is the actual ConfigService key (see config/configuration.ts) --
    // credentials:true CORS requires this to exactly match the frontend's
    // origin for the session cookie to be readable cross-origin at all.
    origin: config.get<string>('corsOrigin', 'http://localhost:3000'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] backend listening on http://localhost:${port}`);
}

bootstrap();
