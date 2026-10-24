const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US10 - Notifications restaurateur', () => {
  let app;
  let database;
  let restaurantToken;
  let studentToken;
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
    const basketId = database.prepare(`
      INSERT INTO paniers (commerce_id, titre, prix_mad, quantite, retrait_debut, retrait_fin)
      VALUES (?, 'Panier spécial', 25, 2, ?, ?)
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

  afterEach(() => {
    database.close();
    jest.restoreAllMocks();
  });

  test('enregistre et affiche une notification au paiement confirmé et simule un e-mail', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const payment = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '123456789' });

    expect(payment.status).toBe(200);
    expect(database.prepare('SELECT COUNT(*) AS total FROM notifications').get().total).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('resto@exemple.ma'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Panier spécial'));

    const response = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${restaurantToken}`);
    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0]).toMatchObject({
      reservation_id: reservationId,
      panier_titre: 'Panier spécial',
      etudiant_email: 'etudiant@exemple.ma',
      statut: 'CONFIRMEE'
    });
    log.mockRestore();
  });

  test('ne crée pas de notification lors d’un paiement refusé et n’en crée qu’une seule', async () => {
    const failed = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '12340000' });
    expect(failed.status).toBe(402);
    expect(database.prepare('SELECT COUNT(*) AS total FROM notifications').get().total).toBe(0);

    const success = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '123456789' });
    expect(success.status).toBe(200);
    const duplicate = await request(app)
      .post(`/api/reservations/${reservationId}/paiement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ numero_carte: '987654321' });
    expect(duplicate.status).toBe(409);
    expect(database.prepare('SELECT COUNT(*) AS total FROM notifications').get().total).toBe(1);
  });

  test('limite les notifications aux restaurateurs', async () => {
    const studentResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentResponse.status).toBe(403);

    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});
