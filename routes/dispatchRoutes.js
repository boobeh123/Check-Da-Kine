const express = require('express');
const { validateDateRange } = require('../middleware/validators');
const dispatchController = require('../controller/dispatchController');

const router = express.Router();

router.get('/', validateDateRange, dispatchController.getDispatches);

module.exports = router;
