function reserveBasket(database, studentId, basketId) {
  const reserve = database.transaction(() => {
    const basket = database.prepare('SELECT id FROM paniers WHERE id = ?').get(basketId);
    if (!basket) return { type: 'not_found' };

    const stock = database.prepare(`
      UPDATE paniers
      SET quantite = quantite - 1
      WHERE id = ? AND quantite > 0 AND datetime(retrait_fin) > datetime('now')
    `).run(basketId);
    if (stock.changes !== 1) return { type: 'unavailable' };

    const result = database.prepare(`
      INSERT INTO reservations (etudiant_id, panier_id, statut)
      VALUES (?, ?, 'EN_ATTENTE_PAIEMENT')
    `).run(studentId, basketId);

    return {
      type: 'reserved',
      id: result.lastInsertRowid,
      statut: 'EN_ATTENTE_PAIEMENT'
    };
  });

  return reserve.immediate();
}

function cancelReservation(database, studentId, reservationId) {
  const cancel = database.transaction(() => {
    const reservation = database.prepare(`
      SELECT r.statut, p.retrait_debut
      FROM reservations r
      JOIN paniers p ON p.id = r.panier_id
      WHERE r.id = ? AND r.etudiant_id = ?
    `).get(reservationId, studentId);
    if (!reservation) return { type: 'not_found' };
    if (!['EN_ATTENTE_PAIEMENT', 'CONFIRMEE'].includes(reservation.statut)) {
      return { type: 'not_cancellable' };
    }

    const deadline = database.prepare(
      "SELECT datetime(?) >= datetime('now', '+1 hour') AS cancellable"
    ).get(reservation.retrait_debut);
    if (!deadline.cancellable) return { type: 'deadline_passed' };

    const updated = database.prepare(`
      UPDATE reservations SET statut = 'ANNULEE'
      WHERE id = ? AND etudiant_id = ? AND statut IN ('EN_ATTENTE_PAIEMENT', 'CONFIRMEE')
    `).run(reservationId, studentId);
    if (updated.changes !== 1) return { type: 'not_cancellable' };

    database.prepare('UPDATE paniers SET quantite = quantite + 1 WHERE id = (SELECT panier_id FROM reservations WHERE id = ?)')
      .run(reservationId);
    return { type: 'cancelled', statut: 'ANNULEE' };
  });

  return cancel.immediate();
}

function payReservation(database, studentId, reservationId, cardNumber) {
  const pay = database.transaction(() => {
    const reservation = database.prepare(`
      SELECT r.statut, p.titre, c.id AS commerce_id, c.nom AS commerce_nom, u.email AS commerce_email
      FROM reservations r
      JOIN paniers p ON p.id = r.panier_id
      JOIN commerces c ON c.id = p.commerce_id
      JOIN users u ON u.id = c.user_id
      WHERE r.id = ? AND r.etudiant_id = ?
    `).get(reservationId, studentId);
    if (!reservation) return { type: 'not_found' };
    if (reservation.statut !== 'EN_ATTENTE_PAIEMENT') {
      return { type: 'not_payable' };
    }
    if (cardNumber.endsWith('0000')) {
      return { type: 'payment_failed' };
    }

    const updated = database.prepare(`
      UPDATE reservations SET statut = 'CONFIRMEE'
      WHERE id = ? AND etudiant_id = ? AND statut = 'EN_ATTENTE_PAIEMENT'
    `).run(reservationId, studentId);
    if (updated.changes !== 1) return { type: 'not_payable' };
    const notification = database.prepare(`
      INSERT INTO notifications (commerce_id, reservation_id)
      VALUES (?, ?)
    `).run(reservation.commerce_id, reservationId);
    return {
      type: 'paid',
      statut: 'CONFIRMEE',
      notification: {
        id: notification.lastInsertRowid,
        commerce_email: reservation.commerce_email,
        commerce_nom: reservation.commerce_nom,
        titre: reservation.titre
      }
    };
  });

  return pay.immediate();
}

function markReservationPickedUp(database, restaurantUserId, reservationId) {
  const markPickedUp = database.transaction(() => {
    const reservation = database.prepare(`
      SELECT r.statut
      FROM reservations r
      JOIN paniers p ON p.id = r.panier_id
      JOIN commerces c ON c.id = p.commerce_id
      WHERE r.id = ? AND c.user_id = ?
    `).get(reservationId, restaurantUserId);
    if (!reservation) return { type: 'not_found' };
    if (reservation.statut !== 'CONFIRMEE') return { type: 'invalid_status' };

    const updated = database.prepare(`
      UPDATE reservations
      SET statut = 'RETIREE'
      WHERE id = ? AND statut = 'CONFIRMEE'
    `).run(reservationId);
    if (updated.changes !== 1) return { type: 'invalid_status' };
    return { type: 'updated', statut: 'RETIREE' };
  });

  return markPickedUp.immediate();
}

module.exports = {
  reserveBasket,
  cancelReservation,
  payReservation,
  markReservationPickedUp
};
