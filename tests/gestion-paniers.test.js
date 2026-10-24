const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US08 - Gestion des paniers restaurateur', () => {
  let app;
  let database;
  let restaurantToken;
  let studentToken;
  let commerceId;

  function basketPayload(title = 'Panier du jour') {
    return {
      titre: title,
      prix_mad: 30,
      quantite: 2,
      retrait_debut: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      retrait_fin: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    };
  }

  beforeEach(async () => {
    ({ app, database } = createTestContext());
    const restaurant = await request(app).post('/api/commerces/register').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });
    commerceId = restaurant.body.id;
    const login = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });
    restaurantToken = login.body.token;

    await request(app).post('/api/auth/register').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const studentLogin = await request(app).post('/api/auth/login').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    studentToken = studentLogin.body.token;
  });

  afterEach(() => database.close());

  test('crée, liste, modifie et supprime un panier non réservé', async () => {
    const created = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(basketPayload());
    expect(created.status).toBe(201);

    const list = await request(app)
      .get('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`);
    expect(list.status).toBe(200);
    expect(list.body.paniers).toHaveLength(1);
    expect(list.body.paniers[0]).toMatchObject({
      id: created.body.id,
      titre: 'Panier du jour',
      prix_mad: 30,
      quantite: 2,
      deja_reserve: 0
    });

    const updated = await request(app)
      .put(`/api/commerces/paniers/${created.body.id}`)
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(basketPayload('Panier modifié'));
    expect(updated.status).toBe(200);
    expect(database.prepare('SELECT titre FROM paniers WHERE id = ?').get(created.body.id).titre)
      .toBe('Panier modifié');

    const deleted = await request(app)
      .delete(`/api/commerces/paniers/${created.body.id}`)
      .set('Authorization', `Bearer ${restaurantToken}`);
    expect(deleted.status).toBe(200);
    expect(database.prepare('SELECT id FROM paniers WHERE id = ?').get(created.body.id)).toBeUndefined();
  });

  test('bloque modification et suppression après une réservation', async () => {
    const created = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(basketPayload());
    const reserved = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: created.body.id });
    expect(reserved.status).toBe(201);

    const update = await request(app)
      .put(`/api/commerces/paniers/${created.body.id}`)
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(basketPayload('Autre titre'));
    expect(update.status).toBe(409);

    const deletion = await request(app)
      .delete(`/api/commerces/paniers/${created.body.id}`)
      .set('Authorization', `Bearer ${restaurantToken}`);
    expect(deletion.status).toBe(409);
    expect(database.prepare('SELECT id FROM paniers WHERE id = ?').get(created.body.id)).toBeTruthy();
  });

  test('refuse l’accès étudiant et les données de panier invalides', async () => {
    const forbidden = await request(app)
      .get('/api/commerces/paniers')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(forbidden.status).toBe(403);

    const invalid = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send({ ...basketPayload(), prix_mad: -1 });
    expect(invalid.status).toBe(400);

    const badHours = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send({
        ...basketPayload(),
        retrait_debut: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        retrait_fin: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      });
    expect(badHours.status).toBe(400);

    const invalidBody = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(null);
    expect(invalidBody.status).toBe(400);
  });

  test('n’autorise pas un commerce à modifier le panier d’un autre commerce', async () => {
    const created = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantToken}`)
      .send(basketPayload());
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

    const response = await request(app)
      .delete(`/api/commerces/paniers/${created.body.id}`)
      .set('Authorization', `Bearer ${otherLogin.body.token}`);
    expect(response.status).toBe(404);
    expect(database.prepare('SELECT id FROM paniers WHERE id = ?').get(created.body.id)).toBeTruthy();
  });
});
