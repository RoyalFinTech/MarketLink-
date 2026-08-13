const { validationResult } = require('express-validator');
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const fields = {};
    errors.array().forEach(({ path, msg }) => { if (!fields[path]) fields[path] = []; fields[path].push(msg); });
    return res.status(422).json({ success: false, error: 'Validation failed.', code: 'VALIDATION_ERROR', fields });
  }
  next();
}
module.exports = { validate };
