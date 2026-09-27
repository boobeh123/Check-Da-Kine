const express = require('express');
const { authLimiter } = require('../middleware/rateLimiters');
const { validateLogin } = require('../middleware/validators');
const authController = require('../controller/authController');

const router = express.Router();

// No signup route: accounts are created with `npm run create-user`
router.get('/login', authController.getLogin);
router.post('/login', authLimiter, validateLogin, authController.postLogin);
router.post('/logout', authController.postLogout);

module.exports = router;
