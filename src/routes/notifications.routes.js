const express = require('express');

function createNotificationsRouter({ database, authenticate, requireRestaurant }) {
  const router = express.Router();

  router.get('/', authenticate, requireRestaurant, (req, res) => {
    const notifications = database.prepare(`
      SELECT n.id, n.reservation_id, n.created_at,
             p.titre AS panier_titre, p.prix_mad,
             r.statut, u.email AS etudiant_email
      FROM notifications n
      JOIN reservations r ON r.id = n.reservation_id
      JOIN paniers p ON p.id = r.panier_id
      JOIN users u ON u.id = r.etudiant_id
      JOIN commerces c ON c.id = n.commerce_id
      WHERE c.user_id = ?
      ORDER BY n.created_at DESC, n.id DESC
    `).all(req.user.id);
    return res.json({ notifications });
  });

  return router;
}

module.exports = { createNotificationsRouter };
