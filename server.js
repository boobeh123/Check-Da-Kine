// server.js
require('dotenv').config(); // First: load .env before anything reads process.env

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const { MongoStore } = require('connect-mongo'); // v6+
const passport = require('passport');
const flash = require('connect-flash');
const connectDB = require('./config/database');

// Sessions can't be signed without a secret; stop here rather than fail on the first login
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add a long random string to .env (and to Railway).');
}

require('./config/passport')(passport);

// Connect once; the session store reuses this connection
const clientPromise = connectDB();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 1. Trust Railway's proxy: required for req.ip, rate limiting, and secure cookies
app.set('trust proxy', 1);
app.set('view engine', 'ejs');

// 2. Security headers: must come before everything else
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Cloudinary images, and OpenStreetMap's map tiles for the Dispatches map
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://tile.openstreetmap.org'],
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

// 5. Static files: before sessions, so asset requests don't touch the session store.
// Leaflet (the Dispatches map) is served from our own site, so no outside script is loaded.
app.use(express.static('public'));
app.use('/vendor/leaflet', express.static('node_modules/leaflet/dist'));

// 6. Sessions, stored in MongoDB. Guests don't get one until something is saved to it.
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ clientPromise }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
  })
);

// 7. Passport: after sessions
app.use(passport.initialize());
app.use(passport.session());

// 8. Flash messages, the logged-in user, and the current path for every view.
// req.flash() writes an empty object into the session even when there's nothing to read,
// which would store a session for every visitor and crawler, so only read what exists.
const takeFlash = (req, type) => (req.session.flash?.[type] ? req.flash(type) : []);

app.use(flash());
app.use((req, res, next) => {
  res.locals.success = takeFlash(req, 'success');
  res.locals.errors = takeFlash(req, 'errors');
  res.locals.error = takeFlash(req, 'error');
  res.locals.info = takeFlash(req, 'info');
  res.locals.user = req.user;
  res.locals.currentPath = req.path; // So the nav can mark the page you're on
  next();
});

// 9. Routes
app.use('/', require('./routes/indexRoutes'));
app.use('/', require('./routes/authRoutes'));
app.use('/arrests', require('./routes/arrestRoutes'));
app.use('/dispatches', require('./routes/dispatchRoutes'));

// 10. 404: after all routes
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    message: "We couldn't find that page.",
  });
});

// 11. Centralized error handler: must be last
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
