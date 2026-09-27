const express = require('express');
const dispatchController = require('../controller/dispatchController');

const router = express.Router();

router.get('/', dispatchController.getDispatches);

module.exports = router;
