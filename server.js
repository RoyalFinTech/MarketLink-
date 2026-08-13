'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(helmet());
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) }, skip: req => req.url==='/health' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', rateLimit({ windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS)||900000, max: parseInt(process.env.RATE_LIMIT_MAX)||300, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many requests.' } }));

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

const API = '/api/v1';
const modules = ['auth','users','customers','vendors','riders','admin','products','categories','orders','payments','delivery','notifications','reviews','messaging','reports','settings','uploads','analytics','assistant'];
modules.forEach(m => app.use(`${API}/${m}`, require(`./modules/${m}/routes`)));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'MarketLink API' }));
app.use(notFound);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT) || 4000;
app.listen(PORT, () => {
  logger.info(`MarketLink API on port ${PORT} [${process.env.NODE_ENV||'development'}]`);
  logger.info(`Docs: http://localhost:${PORT}/api-docs`);
});
module.exports = app;
