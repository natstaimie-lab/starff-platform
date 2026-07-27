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

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Starff API running on http://localhost:${port}/api/v1`);
  console.log(`API docs at            http://localhost:${port}/api/docs`);
}
bootstrap();
