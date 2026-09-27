// middleware/rateLimiters.js
const rateLimit = require('express-rate-limit');

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).render('error', {
      title: 'Too many login attempts',
      message: 'Too many login attempts. Please wait 15 minutes and try again.',
    });
  },
});
