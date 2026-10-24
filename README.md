# Panier Malin

MVP d’application anti-gaspillage alimentaire, construit avec Node.js, Express, SQLite et une interface HTML/CSS/JavaScript sans framework.

## Prérequis

- Node.js 20 ou supérieur
- npm

## Installation

```powershell
npm install
```

Dans PowerShell, définir une clé secrète avant le lancement (`.env.example` indique les variables attendues ; le serveur lit l’environnement du processus) :

```powershell
$env:JWT_SECRET = "remplacer-par-une-cle-aleatoire-longue"
```

`JWT_SECRET` doit rester privé et ne doit pas être ajouté au dépôt. Le serveur crée la base SQLite dans `data/panier-malin.sqlite`.

## Lancement

```powershell
npm start
```

Ouvrir ensuite <http://localhost:3000>.

## Tests

```powershell
npm test
```

Les tests d’API utilisent une base SQLite en mémoire et ne nécessitent pas de configuration supplémentaire.

## Epic 1 — Comptes et authentification

- Inscription étudiant : `POST /api/auth/register`
- Inscription restaurateur et commerce : `POST /api/commerces/register`
- Connexion : `POST /api/auth/login`
- Profil authentifié : `GET /api/auth/me`
- Modification du mot de passe : `PATCH /api/auth/password`
- Déconnexion : `POST /api/auth/logout`
- Espace professionnel : `GET /api/commerces/me` (rôle restaurateur requis)
- Catalogue étudiant : `GET /api/paniers` et `GET /api/paniers/:id`
- Recommandations étudiant : `GET /api/paniers/recommandations` (paniers en stock dont le retrait n’est pas terminé)
- Filtres du catalogue : `mot_cle`, `prix_min`, `prix_max`, `heure_debut`, `heure_fin`
- Réserver un panier : `POST /api/reservations` ; consulter ses réservations : `GET /api/reservations/me`
- Annuler une réservation : `POST /api/reservations/:id/annuler` (jusqu’à une heure avant le retrait)
- Paiement simulé : `POST /api/reservations/:id/paiement` avec `numero_carte` (suffixe `0000` refusé)
- Gestion des paniers du restaurateur : `GET/POST /api/commerces/paniers`, `PUT/DELETE /api/commerces/paniers/:id`
- Réservations reçues : `GET /api/reservations/commerce` ; passage à `RETIREE` d’une réservation `CONFIRMEE` : `PATCH /api/reservations/:id/statut`
- Notifications restaurateur : `GET /api/notifications` ; une notification est créée lors du paiement réussi et un e-mail simulé est affiché dans la console

Les mots de passe doivent contenir au moins 8 caractères. Les jetons JWT expirent après 8 heures. La déconnexion est stateless : l’interface supprime le jeton stocké côté client ; un jeton déjà copié reste valide jusqu’à son expiration.

Le filtre horaire porte sur l’heure de début de retrait du panier, entre les deux heures fournies (bornes incluses). Le filtre de prix utilise une fourchette inclusive.
