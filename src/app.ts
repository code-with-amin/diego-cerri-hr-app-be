import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { corsOrigins, env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { candidatesRouter } from './modules/candidates/candidates.routes';
import { notesStandaloneRouter } from './modules/notes/notes.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    pinoHttp({
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
      // Don't log noisy health checks at info level.
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/candidates', candidatesRouter);
  app.use('/api/notes', notesStandaloneRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
