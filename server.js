// server.js
require('dotenv').config(); // First: load .env before anything reads process.env

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');

// No sessions, Passport, or flash messages: the site has no user accounts.
// Add them from the standard template if an admin area is ever needed.

// Connect once; the server starts listening after the connection succeeds
const clientPromise = connectDB();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 1. Trust Railway's proxy: required for req.ip and for knowing the connection is HTTPS
app.set('trust proxy', 1);
app.set('view engine', 'ejs');

// 2. Security headers: must come before everything else
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'], // Allow Cloudinary images
        upgradeInsecureRequests: isProduction ? [] : null, // Local dev runs on plain HTTP
      },
    },
  })
);

// 3. Logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// 4. Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 5. Static files
app.use(express.static('public'));

// 6. The current path, so the nav can mark the page you're on
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// 7. Routes
app.use('/', require('./routes/indexRoutes'));
app.use('/arrests', require('./routes/arrestRoutes'));

// 8. 404: after all routes
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    message: "We couldn't find that page.",
  });
});

// 9. Centralized error handler: must be last
app.use((err, req, res, next) => {
  console.error(err); // Full details go to the logs, never to the user
  if (res.headersSent) return next(err);

  const status = err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).render('error', {
    title: 'Something went wrong',
    message: 'Something went wrong. Please try again.',
  });
});

clientPromise
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
