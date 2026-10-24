const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function initializeDatabase(database) {
  database.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  database.exec(schema);
  return database;
}

function openDatabase(filename) {
  return initializeDatabase(new Database(filename));
}

module.exports = { initializeDatabase, openDatabase };
