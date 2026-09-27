const express = require('express');
const indexController = require('../controller/indexController');

const router = express.Router();

router.get('/', indexController.getHome);

module.exports = router;
