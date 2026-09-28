const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, hasPermission, hasAnyPermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const canManageUsers = hasAnyPermission(PERMISSIONS.VIEW_USERS, PERMISSIONS.APPROVE_USER);

router.get('/dashboard', isAuthenticated, hasPermission(PERMISSIONS.VIEW_USERS), adminController.getDashboard);
router.get('/users', isAuthenticated, canManageUsers, adminController.getUsers);
router.get('/users/:id', isAuthenticated, canManageUsers, adminController.getUserDetail);
router.post('/users/:id', isAuthenticated, hasPermission(PERMISSIONS.APPROVE_USER), adminController.updateUser);
router.delete('/users/:id', isAuthenticated, hasPermission(PERMISSIONS.DELETE_USER), adminController.deleteUser);

module.exports = router;
