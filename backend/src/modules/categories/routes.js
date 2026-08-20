// src/modules/categories/routes.js
'use strict';
const router  = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate }    = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');

const ADMIN = ['admin', 'super_admin', 'moderator'];

// ── Public ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List categories (paginated, searchable)
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: parentId
 *         schema: { type: integer }
 *         description: Pass "null" for root categories only
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean }
 *         description: Admin only — include inactive categories
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean }
 *         description: Admin only — include soft-deleted categories
 *     responses:
 *       200:
 *         description: Paginated category list
 */
router.get('/', ctrl.list);

/**
 * @swagger
 * /categories/tree:
 *   get:
 *     summary: Full category tree (nested, active only)
 *     tags: [Categories]
 */
router.get('/tree', ctrl.getTree);

/**
 * @swagger
 * /categories/slug/{slug}:
 *   get:
 *     summary: Get category by URL slug
 *     tags: [Categories]
 */
router.get('/slug/:slug',
  [param('slug').trim().notEmpty().withMessage('Slug is required.')],
  validate,
  ctrl.getBySlug
);

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Categories]
 */
router.get('/:id',
  [param('id').isInt({ min: 1 }).withMessage('Category ID must be a positive integer.')],
  validate,
  ctrl.getById
);

// ── Admin only ────────────────────────────────────────────────────────
/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/',
  authenticate, authorize(...ADMIN),
  [
    body('name')
      .trim().notEmpty().withMessage('Name is required.')
      .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer.'),
    body('icon')
      .optional().isLength({ max: 20 }).withMessage('Icon must be 20 characters or fewer.'),
    body('parentId')
      .optional({ nullable: true }).isInt({ min: 1 }).withMessage('parentId must be a positive integer.'),
    body('sortOrder')
      .optional().isInt({ min: 0 }).withMessage('sortOrder must be a non-negative integer.'),
    body('description')
      .optional().isLength({ max: 500 }).withMessage('Description must be 500 characters or fewer.'),
    body('imageUrl')
      .optional({ nullable: true }).isURL().withMessage('imageUrl must be a valid URL.'),
    body('metaTitle')
      .optional().isLength({ max: 150 }).withMessage('metaTitle must be 150 characters or fewer.'),
    body('metaDescription')
      .optional().isLength({ max: 300 }).withMessage('metaDescription must be 300 characters or fewer.'),
  ],
  validate,
  ctrl.create
);

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id',
  authenticate, authorize(...ADMIN),
  [
    param('id').isInt({ min: 1 }).withMessage('Category ID must be a positive integer.'),
    body('name')
      .optional().trim().notEmpty().withMessage('Name cannot be empty.')
      .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer.'),
    body('icon')
      .optional({ nullable: true }).isLength({ max: 20 }),
    body('parentId')
      .optional({ nullable: true }).isInt({ min: 1 }),
    body('sortOrder')
      .optional().isInt({ min: 0 }),
    body('isActive')
      .optional().isBoolean().withMessage('isActive must be a boolean.'),
    body('description')
      .optional({ nullable: true }).isLength({ max: 500 }),
    body('imageUrl')
      .optional({ nullable: true }).isURL(),
    body('metaTitle')
      .optional({ nullable: true }).isLength({ max: 150 }),
    body('metaDescription')
      .optional({ nullable: true }).isLength({ max: 300 }),
  ],
  validate,
  ctrl.update
);

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     summary: Soft-delete a category (preserves data, blocks if active products exist)
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id',
  authenticate, authorize(...ADMIN),
  [param('id').isInt({ min: 1 })],
  validate,
  ctrl.softDelete
);

/**
 * @swagger
 * /categories/{id}/restore:
 *   post:
 *     summary: Restore a soft-deleted category
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/restore',
  authenticate, authorize(...ADMIN),
  [param('id').isInt({ min: 1 })],
  validate,
  ctrl.restore
);

/**
 * @swagger
 * /categories/reorder:
 *   post:
 *     summary: Bulk-update sort_order for multiple categories
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/reorder',
  authenticate, authorize(...ADMIN),
  [
    body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array.'),
    body('items.*.id').isInt({ min: 1 }).withMessage('Each item must have a valid integer id.'),
    body('items.*.sortOrder').isInt({ min: 0 }).withMessage('Each item must have a valid sortOrder.'),
  ],
  validate,
  ctrl.reorder
);

/**
 * @swagger
 * /categories/{id}/audit:
 *   get:
 *     summary: Audit log for a specific category
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/audit',
  authenticate, authorize(...ADMIN),
  [
    param('id').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.getAuditLog
);

module.exports = router;
