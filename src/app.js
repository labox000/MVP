const path = require('node:path');
const express = require('express');
const { createAuthMiddleware } = require('./middleware/auth');
const { requireRole } = require('./middleware/roles');
const { createAuthRouter } = require('./routes/auth.routes');
const { createCommercesRouter } = require('./routes/commerces.routes');
const { createGestionPaniersRouter } = require('./routes/gestion-paniers.routes');
const { createPaniersRouter } = require('./routes/paniers.routes');
const { createReservationsRouter } = require('./routes/reservations.routes');
const { createNotificationsRouter } = require('./routes/notifications.routes');

function createApp(database, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET doit être défini dans l’environnement.');
  }

  const app = express();
  const authenticate = createAuthMiddleware(jwtSecret);
  const requireRestaurant = requireRole('restaurateur');
  const requireStudent = requireRole('etudiant');

  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/auth', createAuthRouter({ database, jwtSecret, authenticate }));
  app.use('/api/commerces', createCommercesRouter({ database, authenticate, requireRestaurant }));
  app.use('/api/commerces/paniers', createGestionPaniersRouter({
    database,
    authenticate,
    requireRestaurant
  }));
  app.use('/api/paniers', createPaniersRouter({ database, authenticate, requireStudent }));
  app.use('/api/reservations', createReservationsRouter({
    database,
    authenticate,
    requireStudent,
    requireRestaurant
  }));
  app.use('/api/notifications', createNotificationsRouter({
    database,
    authenticate,
    requireRestaurant
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
    }
    console.error('Erreur serveur :', error);
    return res.status(500).json({ erreur: 'Une erreur interne est survenue.' });
  });

  return app;
}

module.exports = { createApp };
