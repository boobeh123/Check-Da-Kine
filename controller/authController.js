const passport = require('passport');
const { validationResult } = require('express-validator');

exports.getLogin = async (req, res) => {
  if (req.user) return res.redirect('/arrests');
  res.render('loginView', { title: 'Log in', description: 'Log in to Check Da Kine. Accounts are by invitation only.' });
};

// Passport reads the (already validated and sanitized) email and password from req.body
exports.postLogin = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('errors', errors.array());
    return res.redirect('/login');
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('errors', [{ msg: info.message }]);
      return res.redirect('/login');
    }

    // Passport starts a fresh session on login, so an old session id can't be reused
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      req.flash('success', "You're logged in. Names are now shown on the Arrests page.");
      res.redirect('/arrests');
    });
  })(req, res, next);
};

exports.postLogout = async (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', "You're logged out.");
    res.redirect('/');
  });
};
