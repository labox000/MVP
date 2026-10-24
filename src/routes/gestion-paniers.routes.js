const express = require('express');

function validateBasket(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Les données du panier sont invalides.' };
  }
  if (typeof body.titre !== 'string' || !body.titre.trim()) {
    return { error: 'Le titre du panier est requis.' };
  }
  const price = Number(body.prix_mad);
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Le prix doit être un nombre positif ou nul.' };
  }
  const quantity = Number(body.quantite);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return { error: 'La quantité doit être un entier positif ou nul.' };
  }

  const start = new Date(body.retrait_debut);
  const end = new Date(body.retrait_fin);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return { error: 'Les horaires de retrait sont invalides.' };
  }
  if (end <= start) {
    return { error: 'La fin du retrait doit être après son début.' };
  }

  return {
    value: {
      titre: body.titre.trim(),
      prix_mad: price,
      quantite: quantity,
      retrait_debut: start.toISOString(),
      retrait_fin: end.toISOString()
    }
  };
}

function createGestionPaniersRouter({ database, authenticate, requireRestaurant }) {
  const router = express.Router();

  router.get('/', authenticate, requireRestaurant, (req, res) => {
    const commerce = database.prepare('SELECT id FROM commerces WHERE user_id = ?').get(req.user.id);
    if (!commerce) {
      return res.status(404).json({ erreur: 'Commerce introuvable.' });
    }
    const paniers = database.prepare(`
      SELECT p.id, p.titre, p.prix_mad, p.quantite, p.retrait_debut, p.retrait_fin,
             EXISTS (SELECT 1 FROM reservations r WHERE r.panier_id = p.id) AS deja_reserve
      FROM paniers p
      WHERE p.commerce_id = ?
      ORDER BY p.id DESC
    `).all(commerce.id);
    return res.json({ paniers });
  });

  router.post('/', authenticate, requireRestaurant, (req, res) => {
    const validated = validateBasket(req.body);
    if (validated.error) {
      return res.status(400).json({ erreur: validated.error });
    }
    const commerce = database.prepare('SELECT id FROM commerces WHERE user_id = ?').get(req.user.id);
    if (!commerce) {
      return res.status(404).json({ erreur: 'Commerce introuvable.' });
    }

    const result = database.prepare(`
      INSERT INTO paniers (commerce_id, titre, prix_mad, quantite, retrait_debut, retrait_fin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      commerce.id,
      validated.value.titre,
      validated.value.prix_mad,
      validated.value.quantite,
      validated.value.retrait_debut,
      validated.value.retrait_fin
    );
    return res.status(201).json({ id: result.lastInsertRowid });
  });

  router.put('/:id', authenticate, requireRestaurant, (req, res) => {
    const basketId = Number(req.params.id);
    if (!Number.isSafeInteger(basketId) || basketId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de panier invalide.' });
    }
    const validated = validateBasket(req.body);
    if (validated.error) {
      return res.status(400).json({ erreur: validated.error });
    }

    const update = database.transaction(() => {
      const commerce = database.prepare('SELECT id FROM commerces WHERE user_id = ?').get(req.user.id);
      if (!commerce) return { type: 'not_found' };
      const basket = database.prepare(
        'SELECT id FROM paniers WHERE id = ? AND commerce_id = ?'
      ).get(basketId, commerce.id);
      if (!basket) return { type: 'not_found' };
      const reservation = database.prepare(
        'SELECT 1 AS exists_reservation FROM reservations WHERE panier_id = ? LIMIT 1'
      ).get(basketId);
      if (reservation) return { type: 'locked' };

      database.prepare(`
        UPDATE paniers
        SET titre = ?, prix_mad = ?, quantite = ?, retrait_debut = ?, retrait_fin = ?
        WHERE id = ?
      `).run(
        validated.value.titre,
        validated.value.prix_mad,
        validated.value.quantite,
        validated.value.retrait_debut,
        validated.value.retrait_fin,
        basketId
      );
      return { type: 'updated' };
    });
    const result = update.immediate();
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Panier introuvable dans votre commerce.' });
    }
    if (result.type === 'locked') {
      return res.status(409).json({ erreur: 'Un panier déjà réservé ne peut plus être modifié.' });
    }
    return res.json({ message: 'Panier modifié avec succès.' });
  });

  router.delete('/:id', authenticate, requireRestaurant, (req, res) => {
    const basketId = Number(req.params.id);
    if (!Number.isSafeInteger(basketId) || basketId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de panier invalide.' });
    }

    const remove = database.transaction(() => {
      const commerce = database.prepare('SELECT id FROM commerces WHERE user_id = ?').get(req.user.id);
      if (!commerce) return { type: 'not_found' };
      const basket = database.prepare(
        'SELECT id FROM paniers WHERE id = ? AND commerce_id = ?'
      ).get(basketId, commerce.id);
      if (!basket) return { type: 'not_found' };
      const reservation = database.prepare(
        'SELECT 1 AS exists_reservation FROM reservations WHERE panier_id = ? LIMIT 1'
      ).get(basketId);
      if (reservation) return { type: 'locked' };

      database.prepare('DELETE FROM paniers WHERE id = ?').run(basketId);
      return { type: 'deleted' };
    });
    const result = remove.immediate();
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Panier introuvable dans votre commerce.' });
    }
    if (result.type === 'locked') {
      return res.status(409).json({ erreur: 'Un panier déjà réservé ne peut plus être supprimé.' });
    }
    return res.json({ message: 'Panier supprimé avec succès.' });
  });

  return router;
}

module.exports = { createGestionPaniersRouter };
