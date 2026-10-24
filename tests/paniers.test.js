const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US03/US04 - Catalogue et recherche des paniers', () => {
  let app;
  let database;
  let studentToken;
  let commerceId;

  function timeFromNow(hours) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  function addBasket({
    title,
    quantity = 2,
    price = 25,
    pickupStart = timeFromNow(1),
    pickupEnd = timeFromNow(2)
  }) {
    return database.prepare(`
      INSERT INTO paniers (commerce_id, titre, prix_mad, quantite, retrait_debut, retrait_fin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(commerceId, title, price, quantity, pickupStart, pickupEnd).lastInsertRowid;
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

    await request(app).post('/api/auth/register').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    studentToken = login.body.token;
  });

  afterEach(() => database.close());

  test('liste uniquement les paniers en stock dont le retrait n’est pas terminé', async () => {
    addBasket({ title: 'Panier disponible' });
    addBasket({ title: 'Épuisé', quantity: 0 });
    addBasket({ title: 'Retrait terminé', pickupEnd: timeFromNow(-1) });

    const response = await request(app)
      .get('/api/paniers')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.paniers).toHaveLength(1);
    expect(response.body.paniers[0]).toMatchObject({
      titre: 'Panier disponible',
      prix_mad: 25,
      commerce_nom: 'Le Bon Plat',
      commerce_adresse: '10 rue Verte'
    });
  });

  test('rend un panier nouvellement créé recommandable puis réservable par un étudiant', async () => {
    const restaurantLogin = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });
    const created = await request(app)
      .post('/api/commerces/paniers')
      .set('Authorization', `Bearer ${restaurantLogin.body.token}`)
      .send({
        titre: 'Panier fraîchement publié',
        prix_mad: 22,
        quantite: 1,
        retrait_debut: timeFromNow(1),
        retrait_fin: timeFromNow(2)
      });
    expect(created.status).toBe(201);

    const recommendations = await request(app)
      .get('/api/paniers/recommandations')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(recommendations.status).toBe(200);
    expect(recommendations.body.paniers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          titre: 'Panier fraîchement publié',
          commerce_nom: 'Le Bon Plat',
          quantite: 1
        })
      ])
    );

    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ panier_id: created.body.id });
    expect(reservation.status).toBe(201);

    const afterReservation = await request(app)
      .get('/api/paniers/recommandations')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(afterReservation.body.paniers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id })])
    );
  });

  test('renvoie le détail d’un panier disponible', async () => {
    const basketId = addBasket({ title: 'Panier du jour' });

    const response = await request(app)
      .get(`/api/paniers/${basketId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.panier).toMatchObject({
      id: basketId,
      titre: 'Panier du jour',
      commerce_nom: 'Le Bon Plat',
      prix_mad: 25
    });
  });

  test('ne révèle pas un panier épuisé ou un identifiant invalide', async () => {
    const unavailableId = addBasket({ title: 'Épuisé', quantity: 0 });

    const unavailable = await request(app)
      .get(`/api/paniers/${unavailableId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(unavailable.status).toBe(404);

    const invalidId = await request(app)
      .get('/api/paniers/invalide')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(invalidId.status).toBe(400);
  });

  test('réserve le catalogue aux étudiants authentifiés', async () => {
    expect((await request(app).get('/api/paniers')).status).toBe(401);

    const restaurantLogin = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });
    const forbidden = await request(app)
      .get('/api/paniers')
      .set('Authorization', `Bearer ${restaurantLogin.body.token}`);
    expect(forbidden.status).toBe(403);
  });

  test('filtre par mot-clé, fourchette de prix et heure de début du retrait', async () => {
    const matchingStart = timeFromNow(1);
    const matchingHour = matchingStart.slice(11, 16);
    addBasket({ title: 'Salade du jour', price: 30, pickupStart: matchingStart });
    addBasket({ title: 'Soupe du jour', price: 20, pickupStart: timeFromNow(3) });

    const response = await request(app)
      .get(`/api/paniers?mot_cle=Salade&prix_min=25&prix_max=30&heure_debut=${matchingHour}&heure_fin=${matchingHour}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.paniers).toHaveLength(1);
    expect(response.body.paniers[0].titre).toBe('Salade du jour');
  });

  test('retourne une liste vide sans erreur lorsqu’aucun panier ne correspond', async () => {
    const response = await request(app)
      .get('/api/paniers?prix_min=100')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.paniers).toEqual([]);
  });

  test('refuse une fourchette de prix ou un filtre horaire invalide', async () => {
    const invalidPrice = await request(app)
      .get('/api/paniers?prix_min=40&prix_max=20')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(invalidPrice.status).toBe(400);

    const incompleteTime = await request(app)
      .get('/api/paniers?heure_debut=10:00')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(incompleteTime.status).toBe(400);
  });
});
