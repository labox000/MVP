const Database = require('better-sqlite3');
const { initializeDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');

function createTestContext() {
  const database = initializeDatabase(new Database(':memory:'));
  const app = createApp(database, { jwtSecret: 'secret-de-test-pour-jest' });
  return { app, database };
}

module.exports = { createTestContext };
