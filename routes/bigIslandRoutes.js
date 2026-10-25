const express = require('express');
const { useAgency } = require('../middleware/agency');
const { validateDateRange, validateArrestsPage } = require('../middleware/validators');
const indexController = require('../controller/indexController');
const arrestController = require('../controller/arrestController');

const router = express.Router();

// The Big Island's versions of the stats and arrests pages: the same controllers as Oʻahu's,
// told which island to show
router.get('/', useAgency('bigIsland'), validateDateRange, indexController.getHome);
router.get('/arrests', useAgency('bigIsland'), validateArrestsPage, arrestController.getArrests);

module.exports = router;
