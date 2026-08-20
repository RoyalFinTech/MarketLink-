'use strict';
const router = require('express').Router();
const {  authenticate  } = require('../../middleware/auth');
router.all('*', authenticate, (req, res) => res.status(501).json({  success: false, error: 'Module not yet implemented.', code: 'NOT_IMPLEMENTED'  }));
module.exports = router;
