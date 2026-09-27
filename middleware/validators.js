const { query } = require('express-validator');

const dayFormat = { format: 'YYYY-MM-DD', strictMode: true, delimiters: ['-'] };

// Dates arrive from the dashboard's date inputs as YYYY-MM-DD; both are optional
exports.validateDateRange = [
  query('start')
    .optional({ values: 'falsy' })
    .isString()
    .isDate(dayFormat)
    .withMessage('Enter a real start date, written as YYYY-MM-DD.'),
  query('end')
    .optional({ values: 'falsy' })
    .isString()
    .isDate(dayFormat)
    .withMessage('Enter a real end date, written as YYYY-MM-DD.')
    // YYYY-MM-DD strings sort the same way as the dates they represent
    .custom((end, { req }) => typeof req.query.start !== 'string' || !req.query.start || end >= req.query.start)
    .withMessage('The end date must be on or after the start date.'),
];
