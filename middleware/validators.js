const { body, query } = require('express-validator');

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

const brokenLinkMessage = 'That link to more arrests is broken.';

// The Arrests page: an optional search and filters, and the "load more" link's position in
// the feed, which carries the last card's time and id (both or neither)
exports.validateArrestsPage = [
  query('beforeTime')
    .optional({ values: 'falsy' })
    .isString()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage(brokenLinkMessage),
  query('beforeId').optional({ values: 'falsy' }).isString().isMongoId().withMessage(brokenLinkMessage),
  query('beforeId')
    .custom((beforeId, { req }) => !beforeId === !req.query.beforeTime)
    .withMessage(brokenLinkMessage),
  // The Arrests search box; the words are cleaned further before any query (searchWords.js)
  query('q')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Keep the search to 100 characters or fewer.'),
  // The filter dropdowns. A charge or officer that isn't on record simply matches nothing
  // (filterOptions.js), so these only check the shape. The message given with each field
  // covers every check on it.
  query('charge', 'Choose a charge from the list.').optional({ values: 'falsy' }).isString().trim().isLength({ max: 200 }),
  query('sex', 'Choose Male or Female.').optional({ values: 'falsy' }).isString().isIn(['M', 'F']),
  query('officer', 'Choose an officer from the list.').optional({ values: 'falsy' }).isString().trim().isLength({ max: 200 }),
];

// Passport reads req.body itself, so the sanitizers here update the email it sees.
// bcrypt only reads the first 72 bytes, and the cap stops huge passwords tying up the server.
exports.validateLogin = [
  body('email').isString().trim().toLowerCase().isEmail().withMessage('Enter a valid email address.'),
  body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Enter your password.'),
];
