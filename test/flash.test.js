// The session-backed messages that replaced connect-flash (middleware/flash.js). A plain object
// stands in for req.session first; the tests at the bottom run it with the real express-session,
// the way server.js wires it.
const { once } = require('node:events');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const flash = require('../middleware/flash');

describe('flash middleware', () => {
  let req;
  let nextCalls;

  beforeEach(() => {
    req = { session: {} };
    nextCalls = 0;
    flash(req, {}, () => (nextCalls += 1));
  });

  it('adds req.flash and moves on', () => {
    assert.equal(typeof req.flash, 'function');
    assert.equal(nextCalls, 1);
  });

  it('queues a message and returns how many of that type are queued', () => {
    assert.equal(req.flash('success', "You're logged in."), 1);
    assert.equal(req.flash('success', "You're logged out."), 2);
    assert.deepEqual(req.session.flash, { success: ["You're logged in.", "You're logged out."] });
  });

  // A rejected login flashes [{ msg }, ...] (authController.js)
  it('queues each item of a list', () => {
    assert.equal(req.flash('errors', [{ msg: 'Enter a valid email address.' }, { msg: 'Enter your password.' }]), 2);
    assert.deepEqual(req.flash('errors'), [{ msg: 'Enter a valid email address.' }, { msg: 'Enter your password.' }]);
  });

  it('returns one type oldest first, clears it, and leaves the other types queued', () => {
    req.flash('info', 'First');
    req.flash('info', 'Second');
    req.flash('errors', { msg: 'Still here.' });

    assert.deepEqual(req.flash('info'), ['First', 'Second']);
    assert.deepEqual(req.flash('info'), []);
    assert.deepEqual(req.session.flash, { errors: [{ msg: 'Still here.' }] });
  });

  // An unchanged session isn't saved, so a visitor gets no cookie
  it('leaves the session alone when reading with nothing queued', () => {
    assert.deepEqual(req.flash('success'), []);
    assert.deepEqual(req.flash('errors'), []);
    assert.deepEqual(req.session, {});
  });

  // req.session is missing when the session store can't be reached
  it('reads as empty when the request has no session at all', () => {
    delete req.session;
    assert.deepEqual(req.flash('info'), []);
  });

  // Passport replaces the session when someone logs in or out
  it('writes to the session the request has at the time of the call', () => {
    const oldSession = req.session;
    req.session = {};

    req.flash('success', "You're logged out.");

    assert.equal(req.session.flash.success.length, 1);
    assert.deepEqual(oldSession, {});
  });

  it('throws rather than lose a message when there is no session', () => {
    delete req.session;
    assert.throws(() => req.flash('success', 'Saved.'), /needs a session to keep messages in/);
  });

  it('throws when called without a type', () => {
    assert.throws(() => req.flash(), TypeError);
    assert.throws(() => req.flash('', 'Saved.'), TypeError);
  });
});

describe('with express-session, the way server.js wires it', () => {
  // server.js reads all four types on every request, to show them
  const buildApp = () => {
    const app = express();
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use(flash);
    app.get('/', (req, res) => res.json(['success', 'errors', 'error', 'info'].map((type) => req.flash(type))));
    app.get('/save', (req, res) => {
      req.flash('success', "You're logged in.");
      res.redirect('/');
    });
    return app;
  };

  // Starts the app on a free port, hands its address to check, and always stops it
  const withServer = async (check) => {
    const server = buildApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      await check(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.close();
      server.closeAllConnections();
    }
  };

  // connect-flash created session.flash on every read, which would give every visitor, bots
  // included, a cookie and a session in the database
  it('gives a visitor with nothing queued no session cookie', async () => {
    await withServer(async (base) => {
      const response = await fetch(base);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('set-cookie'), null);
    });
  });

  it('shows a message on the next page, and only once', async () => {
    await withServer(async (base) => {
      const saved = await fetch(`${base}/save`, { redirect: 'manual' });
      const cookie = saved.headers.get('set-cookie').split(';')[0];

      const first = await (await fetch(base, { headers: { cookie } })).json();
      const second = await (await fetch(base, { headers: { cookie } })).json();

      assert.deepEqual(first[0], ["You're logged in."]);
      assert.deepEqual(second[0], []);
    });
  });
});
