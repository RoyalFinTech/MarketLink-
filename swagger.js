const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'MarketLink Gambia API', version: '1.0.0', description: 'REST API for MarketLink multi-vendor marketplace.' },
    servers: [{ url: `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/v1` }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' }, code: { type: 'string' } } },
      },
    },
  },
  apis: [path.join(__dirname, '../modules/**/routes.js')],
});
