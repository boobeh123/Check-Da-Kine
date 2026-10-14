// middleware/flash.js
// Messages for the next page, kept in the session until a page shows them. This replaced
// connect-flash, which was last released in 2013 and calls Node's deprecated util.isArray,
// and keeps its API for the two calls this app makes:
//
//   req.flash(type, message)  queues the message, or each item of a list, and returns how
//                             many of that type are now queued
//   req.flash(type)           returns that type's messages, oldest first ([] when there are
//                             none), and clears them
//
// Reading never creates session.flash. express-session only saves a session that changed
// (saveUninitialized: false in server.js), so a visitor with nothing queued gets no cookie
// and no session in the database, however often a page reads.
//
// req.session is looked up on every call rather than kept, because Passport replaces the
// session when someone logs in or out.

const flash = (req, res, next) => {
  req.flash = (type, message) => {
    if (!type) throw new TypeError('req.flash() needs a message type');

    // Reading: hand back that type's messages and clear them
    if (message === undefined) {
      const queued = req.session?.flash;
      const messages = queued?.[type] ?? [];
      if (queued) delete queued[type];
      return messages;
    }

    // Writing: a message with nowhere to go would vanish, so say so
    if (!req.session) throw new Error('req.flash() needs a session to keep messages in');
    req.session.flash ??= {};
    req.session.flash[type] = (req.session.flash[type] ?? []).concat(message);
    return req.session.flash[type].length;
  };
  next();
};

module.exports = flash;
