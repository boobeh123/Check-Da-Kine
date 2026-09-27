const express = require('express');
const { validateArrestCursor } = require('../middleware/validators');
const arrestController = require('../controller/arrestController');

const router = express.Router();

router.get('/', validateArrestCursor, arrestController.getArrests);

module.exports = router;
