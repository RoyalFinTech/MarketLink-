// src/modules/uploads/routes.js
'use strict';
const router = require('express').Router();
const { param, body } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./controller');

/**
 * @swagger
 * /uploads:
 *   post:
 *     summary: Upload a file (multipart/form-data, field name = "file")
 *     tags: [Uploads]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               purpose:
 *                 type: string
 *                 enum: [profile_photo, product_image, vendor_logo, vendor_document,
 *                        rider_document, banner, general]
 *     responses:
 *       201: { description: "File uploaded, returns url and record" }
 *       400: { description: Invalid file type or size }
 *       503: { description: Storage provider not configured }
 */
router.post('/', authenticate, ctrl.uploadMiddleware, ctrl.uploadFile);

router.delete('/:id',
  authenticate,
  [param('id').isUUID().withMessage('Invalid file ID.')],
  validate,
  ctrl.deleteFile
);

module.exports = router;
