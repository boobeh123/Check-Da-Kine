// config/passport.js
const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcrypt');
const User = require('../model/User');

// The same message for an unknown email and a wrong password, so the form doesn't reveal
// which emails have accounts
const loginFailedMessage = 'Email or password is incorrect.';

// Checked when the email has no account, so that attempt takes as long as a wrong password
const unknownUserHash = bcrypt.hashSync('no account has this password', 12);

module.exports = (passport) => {
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        const passwordMatches = await bcrypt.compare(password, user?.password ?? unknownUserHash);

        if (!user || !passwordMatches) return done(null, false, { message: loginFailedMessage });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // The session stores only the user's id
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).lean();
      done(null, user ? { id: String(user._id), email: user.email } : false);
    } catch (err) {
      done(err);
    }
  });
};
