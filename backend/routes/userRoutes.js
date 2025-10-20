const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');

router.post('/register',userController.register);
router.post('/login',userController.login);
router.post('/logout',userController.logout);
router.post('/confirm',userController.confirm);
router.post('/verify-totp', userController.verifyTotp);
router.post('/ban',userController.ban);

module.exports = router;