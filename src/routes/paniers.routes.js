const express = require('express');

function parseFilters(query) {
  const filters = [];
  const values = [];

  for (const parameter of ['mot_cle', 'prix_min', 'prix_max', 'heure_debut', 'heure_fin']) {
    if (query[parameter] !== undefined && typeof query[parameter] !== 'string') {
      return { error: `Le paramètre ${parameter} est invalide.` };
    }
  }

  const keyword = query.mot_cle?.trim();
  if (keyword) {
    const escapedKeyword = keyword.replace(/[\\%_]/g, '\\$&');
    filters.push("(p.titre LIKE ? ESCAPE '\\' COLLATE NOCASE OR c.nom LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    values.push(`%${escapedKeyword}%`, `%${escapedKeyword}%`);
  }

  const minimumPrice = query.prix_min === undefined || query.prix_min === '' ? null : Number(query.prix_min);
  const maximumPrice = query.prix_max === undefined || query.prix_max === '' ? null : Number(query.prix_max);
  if (minimumPrice !== null && (!Number.isFinite(minimumPrice) || minimumPrice < 0)) {
    return { error: 'Le prix minimum doit être un nombre positif ou nul.' };
  }
  if (maximumPrice !== null && (!Number.isFinite(maximumPrice) || maximumPrice < 0)) {
    return { error: 'Le prix maximum doit être un nombre positif ou nul.' };
  }
  if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) {
    return { error: 'Le prix minimum ne peut pas dépasser le prix maximum.' };
  }
  if (minimumPrice !== null) {
    filters.push('p.prix_mad >= ?');
    values.push(minimumPrice);
  }
  if (maximumPrice !== null) {
    filters.push('p.prix_mad <= ?');
    values.push(maximumPrice);
  }

  const startTime = query.heure_debut;
  const endTime = query.heure_fin;
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if ((startTime === undefined) !== (endTime === undefined)) {
    return { error: 'Les heures de début et de fin du filtre doivent être renseignées ensemble.' };
  }
  if (startTime !== undefined) {
    if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
      return { error: 'Les heures doivent être au format HH:MM.' };
    }
    if (startTime > endTime) {
      return { error: 'L’heure de début ne peut pas dépasser l’heure de fin.' };
    }
    filters.push('substr(time(p.retrait_debut), 1, 5) BETWEEN ? AND ?');
    values.push(startTime, endTime);
  }

  return { filters, values };
}

function createPaniersRouter({ database, authenticate, requireStudent }) {
  const router = express.Router();
  const availableBasket = `
    SELECT p.id, p.titre, p.prix_mad, p.quantite, p.retrait_debut, p.retrait_fin,
           c.id AS commerce_id, c.nom AS commerce_nom, c.adresse AS commerce_adresse
    FROM paniers p
    JOIN commerces c ON c.id = p.commerce_id
    WHERE p.quantite > 0 AND datetime(p.retrait_fin) > datetime('now')
  `;

  const listAvailableBaskets = (req, res) => {
    const parsed = parseFilters(req.query);
    if (parsed.error) {
      return res.status(400).json({ erreur: parsed.error });
    }

    const conditions = parsed.filters.length ? ` AND ${parsed.filters.join(' AND ')}` : '';
    const paniers = database.prepare(
      `${availableBasket}${conditions} ORDER BY p.retrait_debut, p.id`
    ).all(...parsed.values);
    return res.json({ paniers });
  };

  router.get('/recommandations', authenticate, requireStudent, listAvailableBaskets);
  router.get('/', authenticate, requireStudent, listAvailableBaskets);
  router.get('/:id', authenticate, requireStudent, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Identifiant de panier invalide.' });
    }

    const panier = database.prepare(`${availableBasket} AND p.id = ?`).get(id);
    if (!panier) {
      return res.status(404).json({ erreur: 'Panier indisponible ou introuvable.' });
    }
    return res.json({ panier });
  });

  return router;
}

module.exports = { createPaniersRouter };
