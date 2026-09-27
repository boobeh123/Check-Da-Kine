const express = require('express');
const { validateDateRange } = require('../middleware/validators');
const indexController = require('../controller/indexController');

const router = express.Router();

router.get('/', validateDateRange, indexController.getHome);

module.exports = router;
