const express = require('express');
const bcrypt = require('bcryptjs');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createCommercesRouter({ database, authenticate, requireRestaurant }) {
  const router = express.Router();

  router.post('/register', asyncRoute(async (req, res) => {
    const { email, password, nom, adresse, telephone } = req.body;
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ erreur: 'Adresse e-mail invalide.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ erreur: 'Le mot de passe ne peut pas dépasser 72 octets.' });
    }
    if (![nom, adresse, telephone].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ erreur: 'Le nom, l’adresse et le téléphone du commerce sont requis.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    const createRestaurant = database.transaction(() => {
      const userResult = database.prepare(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
      ).run(normalizedEmail, passwordHash, 'restaurateur');
      const commerceResult = database.prepare(
        'INSERT INTO commerces (user_id, nom, adresse, telephone) VALUES (?, ?, ?, ?)'
      ).run(userResult.lastInsertRowid, nom.trim(), adresse.trim(), telephone.trim());
      return { userId: userResult.lastInsertRowid, commerceId: commerceResult.lastInsertRowid };
    });

    try {
      const created = createRestaurant();
      return res.status(201).json({
        id: created.commerceId,
        utilisateurId: created.userId,
        email: normalizedEmail,
        role: 'restaurateur',
        nom: nom.trim()
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ erreur: 'Cette adresse e-mail est déjà utilisée.' });
      }
      throw error;
    }
  }));

  router.get('/me', authenticate, requireRestaurant, (req, res) => {
    const commerce = database.prepare(
      'SELECT id, nom, adresse, telephone FROM commerces WHERE user_id = ?'
    ).get(req.user.id);
    if (!commerce) {
      return res.status(404).json({ erreur: 'Commerce introuvable.' });
    }
    return res.json({ commerce });
  });

  return router;
}

module.exports = { createCommercesRouter };
