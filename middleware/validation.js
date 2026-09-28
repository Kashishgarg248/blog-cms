const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = {
      type: 'error',
      message: errors.array().map(e => e.msg).join(', ')
    };
    req.session.formData = req.body;
    return res.redirect('back');
  }
  next();
};

const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and a number'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  handleValidationErrors
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const blogValidation = [
  body('title').trim().isLength({ min: 3, max: 255 }).withMessage('Title must be 3–255 characters'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  handleValidationErrors
];

const userApprovalValidation = [
  body('role').isIn(['admin', 'writer', 'reader', 'custom']).withMessage('Invalid role selected'),
  body('status').isIn(['approved', 'rejected', 'suspended']).withMessage('Invalid status'),
  handleValidationErrors
];

module.exports = { registerValidation, loginValidation, blogValidation, userApprovalValidation };
