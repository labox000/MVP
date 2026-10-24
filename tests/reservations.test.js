const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US05 - Réservation et Mes réservations', () => {
  let app;
  let database;
  let studentToken;
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
  });

  afterEach(() => database.close());

  test('crée une réservation en attente et décrémente le stock', async () => {
    const response = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });

    expect(response.status).toBe(201);
    expect(response.body.reservation.statut).toBe('EN_ATTENTE_PAIEMENT');
    expect(database.prepare('SELECT quantite FROM paniers WHERE id = ?').get(basketId).quantite).toBe(1);

    const history = await request(app)
      .get('/api/reservations/me')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(history.status).toBe(200);
    expect(history.body.reservations).toHaveLength(1);
    expect(history.body.reservations[0]).toMatchObject({
      panier_id: basketId,
      titre: 'Panier déjeuner',
      commerce_nom: 'Le Bon Plat',
      statut: 'EN_ATTENTE_PAIEMENT'
    });
  });

  test('ne permet pas de réserver deux fois le dernier panier', async () => {
    database.prepare('UPDATE paniers SET quantite = 1 WHERE id = ?').run(basketId);
    const attempts = await Promise.all([
      request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ panier_id: basketId }),
      request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ panier_id: basketId })
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(database.prepare('SELECT quantite FROM paniers WHERE id = ?').get(basketId).quantite).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS total FROM reservations').get().total).toBe(1);
  });

  test('refuse les accès non authentifiés ou non étudiants', async () => {
    expect((await request(app).post('/api/reservations').send({
      panier_id: basketId
    })).status).toBe(401);

    const restaurantLogin = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });
    const forbidden = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${restaurantLogin.body.token}`)
      .send({ panier_id: basketId });
    expect(forbidden.status).toBe(403);
  });

  test('valide l’identifiant et refuse un panier introuvable ou indisponible', async () => {
    const invalid = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: 'abc' });
    expect(invalid.status).toBe(400);

    const missing = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: 99999 });
    expect(missing.status).toBe(404);

    database.prepare('UPDATE paniers SET retrait_fin = ? WHERE id = ?')
      .run(new Date(Date.now() - 60 * 1000).toISOString(), basketId);
    const expired = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });
    expect(expired.status).toBe(409);
  });

  test('annule une réservation à temps et remet le panier en stock', async () => {
    database.prepare('UPDATE paniers SET quantite = 1 WHERE id = ?').run(basketId);
    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });

    const cancelled = await request(app)
      .post(`/api/reservations/${reservation.body.reservation.id}/annuler`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reservation.statut).toBe('ANNULEE');
    expect(database.prepare('SELECT quantite FROM paniers WHERE id = ?').get(basketId).quantite).toBe(1);
    expect(database.prepare('SELECT statut FROM reservations').get().statut).toBe('ANNULEE');
  });

  test('refuse une annulation moins d’une heure avant le retrait', async () => {
    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });
    database.prepare('UPDATE paniers SET retrait_debut = ? WHERE id = ?')
      .run(new Date(Date.now() + 59 * 60 * 1000).toISOString(), basketId);

    const response = await request(app)
      .post(`/api/reservations/${reservation.body.reservation.id}/annuler`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(409);
    expect(database.prepare('SELECT statut FROM reservations').get().statut).toBe('EN_ATTENTE_PAIEMENT');
    expect(database.prepare('SELECT quantite FROM paniers WHERE id = ?').get(basketId).quantite).toBe(1);
  });

  test('n’autorise pas un autre étudiant à annuler la réservation', async () => {
    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: basketId });
    await request(app).post('/api/auth/register').send({
      email: 'autre@exemple.ma',
      password: 'motdepasse123'
    });
    const otherLogin = await request(app).post('/api/auth/login').send({
      email: 'autre@exemple.ma',
      password: 'motdepasse123'
    });

    const response = await request(app)
      .post(`/api/reservations/${reservation.body.reservation.id}/annuler`)
      .set('Authorization', `Bearer ${otherLogin.body.token}`);
    expect(response.status).toBe(404);
  });
});
