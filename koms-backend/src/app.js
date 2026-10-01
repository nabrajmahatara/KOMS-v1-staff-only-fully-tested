import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import config from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.isAllowedClientOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(fileURLToPath(new URL('../uploads/', import.meta.url)), {
  setHeaders(res) { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); },
}));
app.use(morgan('dev'));
app.get('/health', (req, res) => res.status(200).json({ success: true, message: 'KOMS API is healthy' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);
export default app;
