# Panier Malin : contexte du projet

Panier Malin est le MVP d'une application anti-gaspillage alimentaire (même concept
que Too Good To Go). Des restaurateurs vendent leurs invendus sous forme de « paniers »
à prix réduit. Des étudiants les consultent, les réservent, les paient (paiement simulé)
et les retirent chez le commerçant.

Acteurs : étudiant, restaurateur.

## Stack imposée
- Backend : Node.js, Express, SQLite (better-sqlite3)
- Authentification : JWT (jsonwebtoken), mots de passe hachés avec bcryptjs
- Frontend : une page HTML/CSS/JS sans framework, responsive (mobile d'abord), servie par Express depuis /public
- Tests : Jest + supertest pour l'API
- Devise : MAD. Langue de l'interface et des messages d'erreur : français

## Règles métier
- Deux rôles : etudiant et restaurateur. Chaque route est protégée selon le rôle.
- Un panier : titre, prix, quantité, horaire de retrait (début et fin), commerce.
- Seuls les paniers en stock et dont le retrait n'est pas terminé sont visibles des étudiants.
- La réservation doit être atomique : impossible de réserver le dernier panier deux fois.
- Statuts d'une réservation : EN_ATTENTE_PAIEMENT, CONFIRMEE, ANNULEE, RETIREE.
- Annulation possible uniquement jusqu'à 1 h avant le début du retrait ; le panier est alors remis en stock.
- Paiement simulé : une carte finissant par 0000 donne un échec, toute autre un succès.
  Le succès passe la réservation à CONFIRMEE.
- Un panier déjà réservé ne peut plus être modifié ni supprimé par le restaurateur.
- Notification au restaurateur à chaque réservation confirmée : enregistrée en base,
  affichée dans son espace, et e-mail simulé (affiché en console).

## Conventions
- Code simple et commenté en français, un fichier par responsabilité dès que server.js dépasse 200 lignes.
- Ne jamais stocker un mot de passe en clair ; lire JWT_SECRET depuis l'environnement.
- Échapper tout contenu saisi par l'utilisateur avant de l'afficher.
- Fournir un README avec les commandes d'installation, de lancement et de test.
- Hors périmètre du MVP : acteur Support IT, vrai paiement, vrais e-mails.