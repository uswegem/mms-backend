import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  if (!config.get<boolean>('swagger.enabled')) return;

  const document = new DocumentBuilder()
    .setTitle(config.get<string>('swagger.title')!)
    .setDescription(config.get<string>('swagger.description')!)
    .setVersion(config.get<string>('swagger.version')!)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('health', 'Health checks')
    .addTag('Authentication', 'Login, refresh, MFA, password reset')
    .build();

  const factory = () => SwaggerModule.createDocument(app, document);
  SwaggerModule.setup('api/docs', app, factory, {
    swaggerOptions: { persistAuthorization: true },
  });
}
