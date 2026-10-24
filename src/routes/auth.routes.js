const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_MAX_BYTES = 72;

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validateEmail(email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Adresse e-mail invalide.';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    return 'Le mot de passe ne peut pas dépasser 72 octets.';
  }
  return null;
}

function validateCredentials(email, password) {
  return validateEmail(email) || validatePassword(password);
}

function createAuthRouter({ database, jwtSecret, authenticate }) {
  const router = express.Router();

  router.post('/register', asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    const validationError = validateCredentials(email, password);
    if (validationError) {
      return res.status(400).json({ erreur: validationError });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const result = database.prepare(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
      ).run(normalizedEmail, passwordHash, 'etudiant');
      return res.status(201).json({ id: result.lastInsertRowid, email: normalizedEmail, role: 'etudiant' });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ erreur: 'Cette adresse e-mail est déjà utilisée.' });
      }
      throw error;
    }
  }));

  router.post('/login', asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ erreur: 'Adresse e-mail et mot de passe requis.' });
    }

    const user = database.prepare(
      'SELECT id, email, password_hash, role FROM users WHERE email = ?'
    ).get(email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ erreur: 'Adresse e-mail ou mot de passe incorrect.' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '8h' });
    return res.json({
      token,
      utilisateur: { id: user.id, email: user.email, role: user.role }
    });
  }));

  router.post('/logout', authenticate, (req, res) => {
    res.json({ message: 'Déconnexion réussie. Supprimez le jeton côté client.' });
  });

  router.get('/me', authenticate, (req, res) => {
    const user = database.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }
    return res.json({ utilisateur: user });
  });

  router.patch('/password', authenticate, asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const validationError = validatePassword(newPassword);
    if (validationError) {
      return res.status(400).json({ erreur: validationError });
    }
    if (typeof currentPassword !== 'string') {
      return res.status(400).json({ erreur: 'Mot de passe actuel requis.' });
    }

    const user = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ erreur: 'Mot de passe actuel incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    return res.json({ message: 'Mot de passe modifié avec succès.' });
  }));

  return router;
}

module.exports = { createAuthRouter };
