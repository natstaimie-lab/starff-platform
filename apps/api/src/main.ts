import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Reject any request body that doesn't match its DTO.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Allow the portals / mobile app to call the API from the browser.
  app.enableCors({ origin: true, credentials: true });

  // Interactive API docs at /api/docs
  const config = new DocumentBuilder()
    .setTitle('Starff API')
    .setDescription('Shared API for admin, portals, mobile app and WordPress')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  // Railway/Render inject PORT; fall back to API_PORT locally, then 3001.
  const port = process.env.PORT ?? process.env.API_PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Starff API running on port ${port} (prefix /api/v1)`);
  console.log(`API docs at /api/docs`);
}
bootstrap();
