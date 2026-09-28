const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { isAuthenticated, hasPermission, hasAnyPermission } = require('../middleware/auth');
const { blogValidation } = require('../middleware/validation');
const { PERMISSIONS } = require('../config/permissions');

router.get('/', isAuthenticated, hasPermission(PERMISSIONS.READ_BLOG), blogController.index);
router.get('/create', isAuthenticated, hasPermission(PERMISSIONS.CREATE_BLOG), blogController.getCreate);
router.post('/', isAuthenticated, hasPermission(PERMISSIONS.CREATE_BLOG), blogValidation, blogController.create);
router.get('/:id', isAuthenticated, hasPermission(PERMISSIONS.READ_BLOG), blogController.show);
router.get('/:id/edit', isAuthenticated, hasPermission(PERMISSIONS.UPDATE_BLOG), blogController.getEdit);
router.put('/:id', isAuthenticated, hasPermission(PERMISSIONS.UPDATE_BLOG), blogValidation, blogController.update);
router.delete('/:id', isAuthenticated, hasPermission(PERMISSIONS.DELETE_BLOG), blogController.delete);

module.exports = router;
