CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('etudiant', 'restaurateur')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commerces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL,
  telephone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paniers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commerce_id INTEGER NOT NULL REFERENCES commerces(id),
  titre TEXT NOT NULL,
  prix_mad REAL NOT NULL CHECK (prix_mad >= 0),
  quantite INTEGER NOT NULL CHECK (quantite >= 0),
  retrait_debut TEXT NOT NULL,
  retrait_fin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etudiant_id INTEGER NOT NULL REFERENCES users(id),
  panier_id INTEGER NOT NULL REFERENCES paniers(id),
  statut TEXT NOT NULL CHECK (
    statut IN ('EN_ATTENTE_PAIEMENT', 'CONFIRMEE', 'ANNULEE', 'RETIREE')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_etudiant
  ON reservations(etudiant_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commerce_id INTEGER NOT NULL REFERENCES commerces(id),
  reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
