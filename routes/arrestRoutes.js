const express = require('express');
const { validateArrestsPage } = require('../middleware/validators');
const arrestController = require('../controller/arrestController');

const router = express.Router();

router.get('/', validateArrestsPage, arrestController.getArrests);

module.exports = router;
