// config/database.js
const mongoose = require('mongoose');

// Neutralize query operators ($ne, $gt, ...) smuggled in through request data
mongoose.set('sanitizeFilter', true);

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.DB_STRING);
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn.connection.getClient(); // For a session store to share, if sessions are added later
};

module.exports = connectDB;
