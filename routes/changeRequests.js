const express = require('express');
const router = express.Router();
const changeRequestController = require('../controllers/changeRequestController');
const { isAuthenticated, hasAnyPermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const canReview = hasAnyPermission(PERMISSIONS.APPROVE_CHANGE, PERMISSIONS.REJECT_CHANGE);

// "My requests" must be registered before "/:id" so it isn't swallowed by the param route.
router.get('/mine', isAuthenticated, changeRequestController.mine);

router.get('/', isAuthenticated, canReview, changeRequestController.index);
router.get('/:id', isAuthenticated, changeRequestController.show); // access control is inside the controller (requester OR checker)
router.post('/:id/approve', isAuthenticated, hasAnyPermission(PERMISSIONS.APPROVE_CHANGE), changeRequestController.approve);
router.post('/:id/reject', isAuthenticated, hasAnyPermission(PERMISSIONS.REJECT_CHANGE), changeRequestController.reject);

module.exports = router;
