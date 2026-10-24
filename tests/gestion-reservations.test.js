const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US09 - Réservations reçues par le commerce', () => {
  let app;
  let database;
  let restaurantToken;
  let studentToken;
  let basketId;
  let reservationId;

  beforeEach(async () => {
    ({ app, database } = createTestContext());
    const restaurant = await request(app).post('/api/commerces/register').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });
    const restaurantLogin = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });
    restaurantToken = restaurantLogin.body.token;
    await request(app).post('/api/auth/register').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const studentLogin = await request(app).post('/api/auth/login').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    studentToken = studentLogin.body.token;
    basketId = database.prepare(`
      INSERT INTO paniers (commerce_id, titre, prix_mad, quantite, retrait_debut, retrait_fin)
      VALUES (?, 'Panier du jour', 25, 2, ?, ?)
    `).run(
      restaurant.body.id,
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    ).lastInsertRowid;
    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });
    reservationId = reservation.body.reservation.id;
  });

  afterEach(() => database.close());

  test('liste les réservations du commerce connecté et marque une réservation confirmée comme retirée', async () => {
    await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '123456789' });

    const list = await request(app)
      .get('/api/reservations/commerce')
      .set('Authorization', `Bearer ${restaurantToken}`);
    expect(list.status).toBe(200);
    expect(list.body.reservations).toHaveLength(1);
    expect(list.body.reservations[0]).toMatchObject({
      id: reservationId,
      titre: 'Panier du jour',
      statut: 'CONFIRMEE',
      etudiant_email: 'etudiant@exemple.ma'
    });

    const updated = await request(app)
      .patch(`/api/reservations/${reservationId}/statut`)
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send({ statut: 'RETIREE' });
    expect(updated.status).toBe(200);
    expect(updated.body.reservation.statut).toBe('RETIREE');
  });

  test('refuse la transition d’une réservation encore en attente et un autre statut demandé', async () => {
    const pending = await request(app)
      .patch(`/api/reservations/${reservationId}/statut`)
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send({ statut: 'RETIREE' });
    expect(pending.status).toBe(409);

    const invalid = await request(app)
      .patch(`/api/reservations/${reservationId}/statut`)
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send({ statut: 'ANNULEE' });
    expect(invalid.status).toBe(400);
  });

  test('protège les routes restaurateur et limite les résultats à ses commerces', async () => {
    const studentResponse = await request(app)
      .get('/api/reservations/commerce')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentResponse.status).toBe(403);

    await request(app).post('/api/commerces/register').send({
      email: 'autre-resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Autre commerce',
      adresse: '20 rue Bleue',
      telephone: '0611111111'
    });
    const otherLogin = await request(app).post('/api/auth/login').send({
      email: 'autre-resto@exemple.ma',
      password: 'motdepasse123'
    });
    const otherList = await request(app)
      .get('/api/reservations/commerce')
      .set('Authorization', `Bearer ${otherLogin.body.token}`);
    expect(otherList.body.reservations).toEqual([]);

    const otherUpdate = await request(app)
      .patch(`/api/reservations/${reservationId}/statut`)
      .set('Authorization', `Bearer ${otherLogin.body.token}`)
      .send({ statut: 'RETIREE' });
    expect(otherUpdate.status).toBe(404);
  });
});
