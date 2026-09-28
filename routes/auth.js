const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isGuest } = require('../middleware/auth');
const { registerValidation, loginValidation } = require('../middleware/validation');

router.get('/login', isGuest, authController.getLogin);
router.post('/login', isGuest, loginValidation, authController.postLogin);
router.get('/register', isGuest, authController.getRegister);
router.post('/register', isGuest, registerValidation, authController.postRegister);
router.post('/logout', authController.logout);

module.exports = router;
