const mongoose = require('mongoose');

// A login. Accounts are invite-only: created with `npm run create-user`, never by signing up.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxLength: 254 },
    password: { type: String, required: true, select: false }, // A bcrypt hash, never the password itself
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
