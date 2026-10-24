const request = require('supertest');
const { createTestContext } = require('./helpers');

describe('US02 - Compte restaurateur et espace professionnel', () => {
  let app;
  let database;

  beforeEach(() => {
    ({ app, database } = createTestContext());
  });

  afterEach(() => database.close());

  test('crée le compte restaurateur et son commerce de façon liée', async () => {
    const registration = await request(app).post('/api/commerces/register').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });

    expect(registration.status).toBe(201);
    expect(registration.body.role).toBe('restaurateur');
    const user = database.prepare('SELECT role, password_hash FROM users').get();
    const commerce = database.prepare('SELECT user_id, nom FROM commerces').get();
    expect(user.role).toBe('restaurateur');
    expect(user.password_hash).not.toBe('motdepasse123');
    expect(commerce.user_id).toBe(registration.body.utilisateurId);
    expect(commerce.nom).toBe('Le Bon Plat');
  });

  test('affiche le commerce au restaurateur connecté', async () => {
    await request(app).post('/api/commerces/register').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123',
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'resto@exemple.ma',
      password: 'motdepasse123'
    });

    const response = await request(app)
      .get('/api/commerces/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(response.status).toBe(200);
    expect(response.body.commerce).toMatchObject({
      nom: 'Le Bon Plat',
      adresse: '10 rue Verte',
      telephone: '0600000000'
    });
  });

  test('interdit les routes professionnelles à un étudiant', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'etudiant@exemple.ma',
      password: 'motdepasse123'
    });
    const response = await request(app)
      .get('/api/commerces/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(response.status).toBe(403);
  });

  test('refuse les champs commerce manquants et les e-mails dupliqués', async () => {
    const missing = await request(app).post('/api/commerces/register').send({
      email: 'r@exemple.ma',
      password: 'motdepasse123'
    });
    expect(missing.status).toBe(400);

    const payload = {
      email: 'r@exemple.ma',
      password: 'motdepasse123',
      nom: 'Commerce',
      adresse: 'Adresse',
      telephone: '0600000000'
    };
    expect((await request(app).post('/api/commerces/register').send(payload)).status).toBe(201);
    expect((await request(app).post('/api/commerces/register').send(payload)).status).toBe(409);
  });
});
