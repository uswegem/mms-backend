import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { configureSwagger } from '@infrastructure/swagger/swagger.setup';
import { ProblemDetailsFilter } from '@shared/infrastructure/filters/problem-details.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      // Swagger UI (served from this same app) needs inline scripts/styles;
      // the API itself serves no HTML, so this only relaxes the docs page.
      contentSecurityPolicy: config.get<boolean>('swagger.enabled')
        ? false
        : undefined,
    }),
  );
  app.useStaticAssets(
    join(process.cwd(), config.get<string>('qr.storagePath') ?? 'storage'),
    {
      prefix: '/storage',
      // Helmet's default Cross-Origin-Resource-Policy: same-origin (set
      // above) blocks the frontend — a different origin in dev, and
      // potentially in prod too — from loading these QR PNG/SVG renders
      // via a plain <img> tag. They carry no more than the TLV payload
      // already exposed to any authenticated caller of the QR list/detail
      // JSON endpoints, so relaxing CORP for just this static path is safe.
      setHeaders: (res: Response) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    },
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('cors.origin'),
    credentials: true,
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  configureSwagger(app, config);

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
}
bootstrap();
