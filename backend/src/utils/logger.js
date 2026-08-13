let winston;
try {
  winston = require('winston');
} catch (err) {
  const log = level => (message, meta) => {
    const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`${level}: ${message}${extra}`);
  };
  module.exports = {
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    http: log('http'),
  };
  return;
}
const isProd = process.env.NODE_ENV === 'production';
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProd
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const m = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${m}`;
        })
      ),
  transports: [new winston.transports.Console()],
});
module.exports = logger;
