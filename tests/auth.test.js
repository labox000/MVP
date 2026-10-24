const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createTestContext } = require('./helpers');

describe('US01 - Authentification étudiant', () => {
  let app;
  let database;

  beforeEach(() => {
    ({ app, database } = createTestContext());
  });

  afterEach(() => database.close());

  test('inscrit un étudiant avec un mot de passe haché', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: '  Etudiant@exemple.ma ',
      password: 'motdepasse123'
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ email: 'etudiant@exemple.ma', role: 'etudiant' });
    const user = database.prepare('SELECT email, password_hash, role FROM users').get();
    expect(user.email).toBe('etudiant@exemple.ma');
    expect(user.role).toBe('etudiant');
    expect(user.password_hash).not.toBe('motdepasse123');
    expect(await bcrypt.compare('motdepasse123', user.password_hash)).toBe(true);
  });

  test('refuse un mot de passe trop court et un e-mail déjà utilisé', async () => {
    const shortPassword = await request(app).post('/api/auth/register').send({
      email: 'a@exemple.ma',
      password: 'court'
    });
    expect(shortPassword.status).toBe(400);

    const payload = { email: 'a@exemple.ma', password: 'motdepasse123' };
    expect((await request(app).post('/api/auth/register').send(payload)).status).toBe(201);
    const duplicate = await request(app).post('/api/auth/register').send(payload);
    expect(duplicate.status).toBe(409);
  });

  test('connecte l’étudiant, fournit son profil et accepte la déconnexion', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'a@exemple.ma',
      password: 'motdepasse123'
    });

    const login = await request(app).post('/api/auth/login').send({
      email: 'A@EXEMPLE.MA',
      password: 'motdepasse123'
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.utilisateur.role).toBe('etudiant');

    const profile = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.utilisateur.email).toBe('a@exemple.ma');

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(logout.status).toBe(200);
  });

  test('permet de modifier le mot de passe après vérification de l’ancien', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'a@exemple.ma',
      password: 'motdepasse123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'a@exemple.ma',
      password: 'motdepasse123'
    });

    const changed = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ currentPassword: 'motdepasse123', newPassword: 'nouveaumdp123' });
    expect(changed.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({
      email: 'a@exemple.ma',
      password: 'motdepasse123'
    })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({
      email: 'a@exemple.ma',
      password: 'nouveaumdp123'
    })).status).toBe(200);
  });

  test('refuse l’accès non authentifié au profil', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });
});
