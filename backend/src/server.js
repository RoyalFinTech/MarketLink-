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

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
}));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) }, skip: req => req.url==='/health' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', rateLimit({ windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS)||900000, max: parseInt(process.env.RATE_LIMIT_MAX)||300, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many requests.' } }));

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

const API = '/api/v1';
const modulesDir = path.join(__dirname, 'modules');
const mountedModules = [];

if (fs.existsSync(modulesDir)) {
  for (const moduleName of fs.readdirSync(modulesDir).sort()) {
    const routeFile = path.join(modulesDir, moduleName, 'routes.js');
    if (!fs.existsSync(routeFile)) continue;
    app.use(`${API}/${moduleName}`, require(routeFile));
    mountedModules.push(moduleName);
  }
}

app.get('/api/v1', (req, res) => {
  res.json({ success: true, mountedModules });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'MarketLink API' }));
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`MarketLink API on port ${PORT} [${process.env.NODE_ENV||'development'}]`);
  logger.info(`Docs: http://localhost:${PORT}/api-docs`);
});
module.exports = app;
