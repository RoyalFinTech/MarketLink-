'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
const { isAllowedCorsOrigin } = require('./utils/corsPolicy');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.disable('x-powered-by');

app.use(cors({
  credentials: false,
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) }, skip: req => req.url==='/health' }));
app.use('/api/v1/payments/webhook/modempay', express.raw({ type: 'application/json', limit: '2mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Serve local uploads only for development; production uploads use Supabase Storage.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { dotfiles: 'deny', index: false, maxAge: '1h' }));
app.use('/api', rateLimit({ windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS)||900000, max: parseInt(process.env.RATE_LIMIT_MAX)||300, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many requests.' } }));

app.get('/', (req, res) => res.json({
  success: true,
  service: 'MarketLink API',
  status: 'ok',
  version: process.env.npm_package_version || '1.0.0',
  health: '/health',
  api: '/api/v1',
  docs: '/api-docs'
}));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'marketlink-api', ts: new Date() }));

const API = '/api/v1';
const modulesDir = path.join(__dirname, 'modules');
const mountedModules = [];
const skippedModules = []; // module folders found with NO routes.js — logged loudly instead of silently ignored

if (fs.existsSync(modulesDir)) {
  for (const moduleName of fs.readdirSync(modulesDir).sort()) {
    const moduleDir = path.join(modulesDir, moduleName);
    if (!fs.statSync(moduleDir).isDirectory()) continue;
    const routeFile = path.join(moduleDir, 'routes.js');
    if (!fs.existsSync(routeFile)) {
      skippedModules.push(moduleName);
      logger.warn(`Module "${moduleName}" has no routes.js at ${routeFile} — it will NOT be mounted at ${API}/${moduleName}.`);
      continue;
    }
    app.use(`${API}/${moduleName}`, require(routeFile));
    mountedModules.push(moduleName);
  }
} else {
  logger.error(`Modules directory not found at ${modulesDir} — no API routes were mounted.`);
}

logger.info(`Mounted modules (${mountedModules.length}): ${mountedModules.join(', ') || '(none)'}`);
if (skippedModules.length) {
  logger.warn(`Skipped modules with no routes.js (${skippedModules.length}): ${skippedModules.join(', ')}`);
}

app.get('/api/v1', (req, res) => {
  res.json({ success: true, mountedModules, skippedModules });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'MarketLink API' }));
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`MarketLink API on port ${PORT} [${process.env.NODE_ENV||'development'}]`);
  logger.info(`Docs: http://localhost:${PORT}/api-docs`);
});
module.exports = app;
