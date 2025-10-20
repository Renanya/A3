// videos.dao.js (CommonJS, PostgreSQL)
const db = require('../db'); // your pg wrapper that exports { connect }

const normalizeBigInts = (obj) => {
  // pg returns BIGINT (int8) as string by default. Keep or coerce as needed.
  const out = { ...obj };
  for (const k in out) {
    if (typeof out[k] === 'bigint') out[k] = out[k].toString();
  }
  return out;
};

// Adds a video
const addVideo = async (video) => {
  const { title, filename, filepath, mimetype, size, duration, author, thumbnail, codec } = video;
  const rawDuration = Number(duration); // e.g. 8.102993
  const durationSeconds = Math.round(rawDuration); // or Math.floor / Math.ceil 
  let conn;
  try {
    conn = await db.connect();
    const { rows } = await conn.query(
      `INSERT INTO videos
       (title, filename, filepath, mimetype, size, duration, author, thumbnail, codec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
       [title, filename, filepath, mimetype, size, durationSeconds, author, thumbnail ?? null, codec ?? null]
    );
    // rows[0].id is a number (INT) in our schema; stringify to keep your old return shape
    return rows[0].id.toString();
  } finally {
    if (conn) conn.release();
  }
};

const getVideosByAuthor = async (authorId) => {
  let conn;
  try {
    conn = await db.connect();
    const { rows } = await conn.query(
      `SELECT * FROM videos WHERE author = $1`,
      [authorId]
    );
    return rows.map(normalizeBigInts);
  } finally {
    if (conn) conn.release();
  }
};

const getVideoById = async (id) => {
  let conn;
  try {
    conn = await db.connect();
    const { rows } = await conn.query(
      `SELECT * FROM videos WHERE id = $1`,
      [id]
    );
    if (!rows.length) return null;
    return normalizeBigInts(rows[0]);
  } finally {
    if (conn) conn.release();
  }
};

const deleteVideo = async (id) => {
  let conn;
  try {
    conn = await db.connect();
    const res = await conn.query(`DELETE FROM videos WHERE id = $1`, [id]);
    return res.rowCount > 0;
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  addVideo,
  getVideosByAuthor,
  getVideoById,
  deleteVideo,
};
