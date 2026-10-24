const jwt = require('jsonwebtoken');

function createAuthMiddleware(jwtSecret) {
  return function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    try {
      req.user = jwt.verify(match[1], jwtSecret);
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        return res.status(401).json({ erreur: 'Jeton invalide ou expiré.' });
      }
      return next(error);
    }
  };
}

module.exports = { createAuthMiddleware };
