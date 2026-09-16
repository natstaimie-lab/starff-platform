import WebSocket from 'ws';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// @supabase/realtime-js requires a global WebSocket at client construction time.
// We never use realtime, but the server-side Supabase admin client (invites,
// signed URLs) needs this to exist on Node runtimes without a native WebSocket.
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket as unknown;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Railway's proxy — trust the first hop so req.ip is the real client
  // IP (from X-Forwarded-For). Rate limiting keys on this, so without it every
  // request would look like it came from the proxy and share one bucket.
  app.set('trust proxy', 1);

  // Security headers. CSP is disabled (this is a JSON API, and CSP would break
  // the Swagger UI) and CORP is set cross-origin so the browser portals can read
  // API responses.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // All routes live under /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Reject any request body that doesn't match its DTO.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // CORS: only our own web portals may call the API from a browser. The mobile
  // app (React Native) and server-to-server callers (the WordPress webhook) send
  // no Origin header and are always allowed — CORS is a browser-only control.
  // Extra origins (e.g. custom domains) can be added via CORS_ORIGINS (CSV).
  const allowedOrigins = new Set<string>([
    'https://starff-platform-admin.vercel.app',
    'https://starff-platform-candidate.vercel.app',
    'https://starff-platform-client.vercel.app',
    'https://starff.co.uk',
    'https://www.starff.co.uk',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    ...(process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  });

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
