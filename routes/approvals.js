const express = require('express');
const router  = express.Router();
const approvalController = require('../controllers/approvalController');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const canCheck = hasPermission(PERMISSIONS.APPROVE_CHANGES);

// Maker: view own requests
router.get('/my-requests', isAuthenticated, approvalController.getMyRequests);

// Checker: full panel
router.get('/',            isAuthenticated, canCheck, approvalController.getList);
router.get('/:id',         isAuthenticated, canCheck, approvalController.getDetail);
router.post('/:id/approve',isAuthenticated, canCheck, approvalController.approve);
router.post('/:id/reject', isAuthenticated, canCheck, approvalController.reject);

module.exports = router;
