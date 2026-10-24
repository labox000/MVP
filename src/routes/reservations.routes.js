const express = require('express');
const {
  cancelReservation,
  markReservationPickedUp,
  payReservation,
  reserveBasket
} = require('../services/reservations.service');

function createReservationsRouter({ database, authenticate, requireStudent, requireRestaurant }) {
  const router = express.Router();

  router.post('/', authenticate, requireStudent, (req, res) => {
    const basketId = Number(req.body.panier_id);
    if (!Number.isSafeInteger(basketId) || basketId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de panier invalide.' });
    }

    const result = reserveBasket(database, req.user.id, basketId);
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Panier introuvable.' });
    }
    if (result.type === 'unavailable') {
      return res.status(409).json({ erreur: 'Ce panier n’est plus disponible.' });
    }
    return res.status(201).json({ reservation: result });
  });

  router.get('/me', authenticate, requireStudent, (req, res) => {
    const reservations = database.prepare(`
      SELECT r.id, r.statut, r.created_at,
             p.id AS panier_id, p.titre, p.prix_mad, p.retrait_debut, p.retrait_fin,
             c.nom AS commerce_nom, c.adresse AS commerce_adresse
      FROM reservations r
      JOIN paniers p ON p.id = r.panier_id
      JOIN commerces c ON c.id = p.commerce_id
      WHERE r.etudiant_id = ?
      ORDER BY r.created_at DESC, r.id DESC
    `).all(req.user.id);
    return res.json({ reservations });
  });

  router.get('/commerce', authenticate, requireRestaurant, (req, res) => {
    const reservations = database.prepare(`
      SELECT r.id, r.statut, r.created_at,
             p.id AS panier_id, p.titre, p.prix_mad, p.retrait_debut, p.retrait_fin,
             u.email AS etudiant_email
      FROM reservations r
      JOIN paniers p ON p.id = r.panier_id
      JOIN commerces c ON c.id = p.commerce_id
      JOIN users u ON u.id = r.etudiant_id
      WHERE c.user_id = ?
      ORDER BY r.created_at DESC, r.id DESC
    `).all(req.user.id);
    return res.json({ reservations });
  });

  router.patch('/:id/statut', authenticate, requireRestaurant, (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de réservation invalide.' });
    }
    if (req.body?.statut !== 'RETIREE') {
      return res.status(400).json({ erreur: 'Le statut demandé doit être RETIREE.' });
    }

    const result = markReservationPickedUp(database, req.user.id, reservationId);
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Réservation introuvable dans votre commerce.' });
    }
    if (result.type === 'invalid_status') {
      return res.status(409).json({ erreur: 'Seule une réservation confirmée peut être marquée comme retirée.' });
    }
    return res.json({ reservation: result });
  });

  router.post('/:id/annuler', authenticate, requireStudent, (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de réservation invalide.' });
    }

    const result = cancelReservation(database, req.user.id, reservationId);
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Réservation introuvable.' });
    }
    if (result.type === 'deadline_passed') {
      return res.status(409).json({ erreur: 'L’annulation est possible jusqu’à une heure avant le début du retrait.' });
    }
    if (result.type === 'not_cancellable') {
      return res.status(409).json({ erreur: 'Cette réservation ne peut plus être annulée.' });
    }
    return res.json({ reservation: result });
  });

  router.post('/:id/paiement', authenticate, requireStudent, (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
      return res.status(400).json({ erreur: 'Identifiant de réservation invalide.' });
    }
    const { numero_carte: cardNumber } = req.body;
    if (typeof cardNumber !== 'string' || !/^\d{4,}$/.test(cardNumber)) {
      return res.status(400).json({ erreur: 'Le numéro de carte factice doit contenir au moins 4 chiffres.' });
    }

    const result = payReservation(database, req.user.id, reservationId, cardNumber);
    if (result.type === 'not_found') {
      return res.status(404).json({ erreur: 'Réservation introuvable.' });
    }
    if (result.type === 'not_payable') {
      return res.status(409).json({ erreur: 'Cette réservation n’est pas en attente de paiement.' });
    }
    if (result.type === 'payment_failed') {
      return res.status(402).json({
        erreur: 'Paiement refusé. La réservation reste en attente de paiement.',
        statut: 'EN_ATTENTE_PAIEMENT'
      });
    }
    console.log(
      `[E-mail simulé] À : ${result.notification.commerce_email} | ` +
      `Nouvelle réservation confirmée chez ${result.notification.commerce_nom} : ` +
      `${result.notification.titre}.`
    );
    return res.json({
      reservation: { id: reservationId, statut: result.statut },
      message: 'Paiement accepté. Réservation confirmée.'
    });
  });

  return router;
}

module.exports = { createReservationsRouter };
