// db.js  (CommonJS, no top-level await)
const pg = require('pg');
const aws_sdk_helpers = require('./middleware/aws_sdk.js');
const { Pool } = pg;

let poolPromise;

async function initPool() {
  const secretRaw = await aws_sdk_helpers.getSecretFromSEC('psql');
  const sec = JSON.parse(secretRaw);

  const user = sec.username ?? sec.user ?? sec.Username;
  const password = sec.password ?? sec.pass ?? sec.Password;
  const host = sec.host ?? "database-1-instance-1.ce2haupt2cta.ap-southeast-2.rds.amazonaws.com";
  const port = Number(sec.port ?? 5432);
  const database = sec.dbname ?? sec.database ?? "cohort_2025";

  return new Pool({
    host, port, user, password, database,
    ssl: { require: true, rejectUnauthorized: false },
    max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
  });
}

function getPool() {
  if (!poolPromise) poolPromise = initPool();
  return poolPromise;
}

async function connect() {
  const db = await getPool();
  return db.connect();
}

async function query(text, params) {
  const db = await getPool();
  return db.query(text, params);
}

module.exports = { connect, query, getPool };
