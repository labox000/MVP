const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US07 - Paiement simulé', () => {
  let app;
  let database;
  let studentToken;
  let reservationId;
  let basketId;

  beforeEach(async () => {
    ({ app, database } = createTestContext());
    const restaurant = await request(app).post('/api/commerces/register').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });
    await request(app).post('/api/auth/register').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    studentToken = login.body.token;
    basketId = database.prepare(`
      INSERT INTO paniers (commerce_id, titre, prix_mad, quantite, retrait_debut, retrait_fin)
      VALUES (?, 'Panier déjeuner', 35, 2, ?, ?)
    `).run(
      restaurant.body.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    ).lastInsertRowid;
    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });
    reservationId = reservation.body.reservation.id;
  });

  afterEach(() => database.close());

  test('refuse une carte finissant par 0000 sans annuler la réservation', async () => {
    const response = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '123456780000' });

    expect(response.status).toBe(402);
    expect(response.body.statut).toBe('EN_ATTENTE_PAIEMENT');
    expect(database.prepare('SELECT statut FROM reservations WHERE id = ?').get(reservationId).statut)
      .toBe('EN_ATTENTE_PAIEMENT');
    expect(database.prepare('SELECT quantite FROM paniers WHERE id = ?').get(basketId).quantite).toBe(1);
  });

  test('confirme la réservation après un paiement réussi', async () => {
    const response = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '1234567890123456' });

    expect(response.status).toBe(200);
    expect(response.body.reservation.statut).toBe('CONFIRMEE');
    expect(database.prepare('SELECT statut FROM reservations WHERE id = ?').get(reservationId).statut)
      .toBe('CONFIRMEE');
  });

  test('permet de réessayer après un échec et refuse un numéro invalide', async () => {
    const failure = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '11110000' });
    expect(failure.status).toBe(402);

    const invalid = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: 'abc' });
    expect(invalid.status).toBe(400);

    const retry = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '123456789999' });
    expect(retry.status).toBe(200);
    expect(retry.body.reservation.statut).toBe('CONFIRMEE');
  });
});
