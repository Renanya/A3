// users.dao.js (CommonJS)
const { connect, query, db } = require('../db.js');

// Create a new user
const createUser = async (username, email, password) => {
  let conn;
  try {
    conn = await db.connect();
    console.log('Trying to insert:', username, email);

    const { rows } = await conn.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [username, email, password]
    );

    const newId = rows[0]?.id;
    console.log('Insert id:', newId);
    return newId;
  } catch (err) {
    // Postgres unique violation
    if (err.code === '23505') {
      // err.constraint will be something like users_username_key or users_email_key
      const c = err.constraint || '';
      if (c.includes('username')) {
        throw new Error('Username already exists');
      } else if (c.includes('email')) {
        throw new Error('Email already exists');
      }
      // Fallback parse
      if ((err.detail || '').includes('(username)')) {
        throw new Error('Username already exists');
      }
      if ((err.detail || '').includes('(email)')) {
        throw new Error('Email already exists');
      }
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

// Find user by username
const getUserByUsername = async (username, callback) => {
  let conn;
  try {
    conn = await db.connect();
    const { rows } = await conn.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    callback(null, rows[0] || null);
  } catch (err) {
    callback(err, null);
  } finally {
    if (conn) conn.release();
  }
};

// Get all users
const getAllUsers = async (callback) => {
  let conn;
  try {
    conn = await db.connect();
    const { rows } = await conn.query('SELECT * FROM users');
    callback(null, rows);
  } catch (err) {
    callback(err, null);
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  createUser,
  getUserByUsername,
  getAllUsers,
};
