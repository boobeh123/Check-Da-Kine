// Creates an invite-only login, or gives an existing one a new password. The password is
// random and printed once; nobody (including this script) can show it again later.
//
// Usage: npm run create-user -- --email you@example.com [--reset]

require('dotenv').config();

const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDB = require('../config/database');
const User = require('../model/User');

const bcryptCost = 12;
const passwordBytes = 18; // 24 characters once base64url-encoded

const getOptions = () => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      reset: { type: 'boolean', default: false },
    },
  });

  const email = values.email?.trim().toLowerCase();
  // A loose check; the login form validates emails properly
  if (!email || !email.includes('@') || email.length > 254) {
    throw new Error('Usage: npm run create-user -- --email you@example.com [--reset]');
  }

  return { email, reset: values.reset };
};

const main = async () => {
  const { email, reset } = getOptions();
  await connectDB();

  try {
    const existing = await User.findOne({ email });
    if (existing && !reset) throw new Error(`${email} already has a login. Add --reset to give it a new password.`);
    if (!existing && reset) throw new Error(`${email} has no login to reset. Leave off --reset to create one.`);

    const password = crypto.randomBytes(passwordBytes).toString('base64url');
    const hash = await bcrypt.hash(password, bcryptCost);

    if (existing) {
      await User.updateOne({ _id: existing._id }, { $set: { password: hash } });
    } else {
      await User.create({ email, password: hash });
    }

    console.log(`\n${existing ? 'Reset the password for' : 'Created a login for'} ${email}`);
    console.log(`Password: ${password}`);
    console.log("Copy it now. It won't be shown again.\n");
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
