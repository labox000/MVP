function requireRole(role) {
  return function authorizeRole(req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ erreur: 'Accès interdit pour ce rôle.' });
    }
    return next();
  };
}

module.exports = { requireRole };
