const path = require('node:path');
const fs = require('node:fs');
const { openDatabase } = require('./src/config/database');
const { createApp } = require('./src/app');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET doit être défini avant le démarrage du serveur.');
}

const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const database = openDatabase(path.join(dataDirectory, 'panier-malin.sqlite'));
const app = createApp(database, { jwtSecret });
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Panier Malin disponible sur http://localhost:${port}`);
});
