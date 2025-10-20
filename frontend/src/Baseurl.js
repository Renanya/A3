// src/config.js
let base = process.env.REACT_APP_API_BASE_URL || '';

/**
 * If base is defined but missing protocol (e.g. "backend:5000"),
 * prefix it with http:// for dev.
 */
if (base && !/^https?:\/\//i.test(base)) {
  base = `http://${base}`;
}

export const baseURL = base;
