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

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.disable('x-powered-by');

const localOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
]);
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...localOrigins, ...configuredOrigins]);

// Static frontends are commonly served from a dynamically assigned localhost
// port, GitHub Pages, Replit, Netlify, or Vercel. Authentication is bearer-token
// based (no cross-origin cookies), so these trusted development/static-hosting
// patterns can be accepted without enabling credentialed cross-origin cookies.
// Explicit CORS_ORIGIN entries still take precedence for private deployments.
function isAllowedCorsOrigin(origin) {
  if (!origin) return true; // file:// / non-browser requests
  if (allowedOrigins.has(origin)) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    if (!isHttp) return false;
    if (u.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]')) return true;
    if (u.protocol === 'https:' && (
      host === 'github.io' || host.endsWith('.github.io') ||
      host === 'replit.dev' || host.endsWith('.replit.dev') ||
      host.endsWith('.repl.co') ||
      host === 'netlify.app' || host.endsWith('.netlify.app') ||
      host === 'vercel.app' || host.endsWith('.vercel.app')
    )) return true;
  } catch (e) {}
  return false;
}

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
