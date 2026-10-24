const views = ['welcome', 'login', 'student-register', 'restaurant-register', 'dashboard', 'catalogue', 'basket-detail', 'reservations', 'payment', 'restaurant-baskets', 'incoming-reservations', 'notifications'];
const feedback = document.getElementById('feedback');
const logoutButton = document.getElementById('logout-button');
let studentCanBrowse = false;
let paymentReservationId = null;
let editingBasketId = null;

function showView(name) {
  for (const view of views) {
    document.getElementById(`${view}-view`).classList.toggle('hidden', view !== name);
  }
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.className = `feedback ${isError ? 'error' : 'success'}`;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.erreur || 'Une erreur est survenue.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function openDashboard(user) {
  studentCanBrowse = user.role === 'etudiant';
  document.getElementById('dashboard-title').textContent =
    user.role === 'restaurateur' ? 'Espace professionnel' : 'Espace étudiant';
  document.getElementById('dashboard-email').textContent = user.email;
  document.getElementById('catalogue-button').classList.toggle('hidden', !studentCanBrowse);
  document.getElementById('reservations-button').classList.toggle('hidden', !studentCanBrowse);
  document.getElementById('restaurant-baskets-button').classList.toggle('hidden', studentCanBrowse);
  document.getElementById('incoming-reservations-button').classList.toggle('hidden', studentCanBrowse);
  document.getElementById('notifications-button').classList.toggle('hidden', studentCanBrowse);
  logoutButton.classList.remove('hidden');
  showView('dashboard');

  const commerceDetails = document.getElementById('commerce-details');
  if (user.role === 'restaurateur') {
    const { commerce } = await api('/api/commerces/me');
    document.getElementById('commerce-name').textContent = commerce.nom;
    document.getElementById('commerce-address').textContent = commerce.adresse;
    document.getElementById('commerce-phone').textContent = commerce.telephone;
    commerceDetails.classList.remove('hidden');
  } else {
    commerceDetails.classList.add('hidden');
  }
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function resetBasketForm() {
  editingBasketId = null;
  const form = document.getElementById('basket-form');
  form.reset();
  document.getElementById('basket-form-title').textContent = 'Créer un panier';
  document.getElementById('basket-submit').textContent = 'Créer le panier';
  document.getElementById('cancel-basket-edit').classList.add('hidden');
}

async function loadRestaurantBaskets() {
  const { paniers } = await api('/api/commerces/paniers');
  const list = document.getElementById('restaurant-basket-list');
  list.replaceChildren();

  for (const panier of paniers) {
    const card = document.createElement('article');
    card.className = 'basket-card';
    const title = document.createElement('h2');
    title.textContent = panier.titre;
    const details = document.createElement('p');
    details.textContent = `${panier.prix_mad} MAD · Stock : ${panier.quantite} · Retrait : ${formatPickupTime(panier.retrait_debut)} – ${formatPickupTime(panier.retrait_fin)}`;
    card.append(title, details);
    if (panier.deja_reserve) {
      const locked = document.createElement('p');
      locked.textContent = 'Ce panier a déjà été réservé et ne peut plus être modifié ni supprimé.';
      card.append(locked);
    } else {
      const edit = document.createElement('button');
      edit.className = 'button button-secondary';
      edit.type = 'button';
      edit.textContent = 'Modifier';
      edit.addEventListener('click', () => editBasket(panier));
      const remove = document.createElement('button');
      remove.className = 'button button-secondary';
      remove.type = 'button';
      remove.textContent = 'Supprimer';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Confirmer la suppression de ce panier ?')) return;
        try {
          await api(`/api/commerces/paniers/${panier.id}`, { method: 'DELETE' });
          showFeedback('Panier supprimé.');
          await loadRestaurantBaskets();
        } catch (error) {
          showFeedback(error.message, true);
        }
      });
      card.append(edit, remove);
    }
    list.append(card);
  }
  showView('restaurant-baskets');
}

function editBasket(panier) {
  editingBasketId = panier.id;
  const form = document.getElementById('basket-form');
  form.elements.titre.value = panier.titre;
  form.elements.prix_mad.value = panier.prix_mad;
  form.elements.quantite.value = panier.quantite;
  form.elements.retrait_debut.value = toLocalDateTime(panier.retrait_debut);
  form.elements.retrait_fin.value = toLocalDateTime(panier.retrait_fin);
  document.getElementById('basket-form-title').textContent = 'Modifier un panier';
  document.getElementById('basket-submit').textContent = 'Enregistrer les modifications';
  document.getElementById('cancel-basket-edit').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadIncomingReservations() {
  const { reservations } = await api('/api/reservations/commerce');
  const list = document.getElementById('incoming-reservation-list');
  const empty = document.getElementById('incoming-reservations-empty');
  list.replaceChildren();
  empty.classList.toggle('hidden', reservations.length > 0);

  for (const reservation of reservations) {
    const card = document.createElement('article');
    card.className = 'basket-card';
    const title = document.createElement('h2');
    title.textContent = reservation.titre;
    const student = document.createElement('p');
    student.textContent = `Étudiant : ${reservation.etudiant_email}`;
    const pickup = document.createElement('p');
    pickup.textContent = `Retrait : ${formatPickupTime(reservation.retrait_debut)} – ${formatPickupTime(reservation.retrait_fin)}`;
    const status = document.createElement('p');
    status.textContent = `Statut : ${reservation.statut}`;
    card.append(title, student, pickup, status);

    if (reservation.statut === 'CONFIRMEE') {
      const pickedUp = document.createElement('button');
      pickedUp.className = 'button';
      pickedUp.type = 'button';
      pickedUp.textContent = 'Marquer comme retirée';
      pickedUp.addEventListener('click', async () => {
        try {
          await api(`/api/reservations/${reservation.id}/statut`, {
            method: 'PATCH',
            body: JSON.stringify({ statut: 'RETIREE' })
          });
          showFeedback('Réservation marquée comme retirée.');
          await loadIncomingReservations();
        } catch (error) {
          showFeedback(error.message, true);
        }
      });
      card.append(pickedUp);
    }
    list.append(card);
  }
  showView('incoming-reservations');
}

async function loadNotifications() {
  const { notifications } = await api('/api/notifications');
  const list = document.getElementById('notification-list');
  const empty = document.getElementById('notifications-empty');
  list.replaceChildren();
  empty.classList.toggle('hidden', notifications.length > 0);

  for (const notification of notifications) {
    const card = document.createElement('article');
    card.className = 'basket-card';
    const title = document.createElement('h2');
    title.textContent = 'Nouvelle réservation confirmée';
    const basket = document.createElement('p');
    basket.textContent = `Panier : ${notification.panier_titre}`;
    const student = document.createElement('p');
    student.textContent = `Étudiant : ${notification.etudiant_email}`;
    const created = document.createElement('p');
    created.textContent = `Reçue le ${formatPickupTime(notification.created_at)}`;
    card.append(title, basket, student, created);
    list.append(card);
  }
  showView('notifications');
}

function formatPickupTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function loadCatalogue() {
  const filters = new URLSearchParams();
  for (const [name, value] of new FormData(document.getElementById('search-filters')).entries()) {
    if (typeof value === 'string' && value.trim()) filters.set(name, value.trim());
  }
  const query = filters.toString();
  const { paniers } = await api(`/api/paniers/recommandations${query ? `?${query}` : ''}`);
  const list = document.getElementById('basket-list');
  const empty = document.getElementById('catalogue-empty');
  list.replaceChildren();
  empty.classList.toggle('hidden', paniers.length > 0);
  empty.textContent = filters.size
    ? 'Aucun panier ne correspond à vos critères.'
    : 'Aucun panier disponible pour le moment.';

  for (const panier of paniers) {
    const card = document.createElement('article');
    card.className = 'basket-card';
    const title = document.createElement('h2');
    title.textContent = panier.titre;
    const merchant = document.createElement('p');
    merchant.textContent = panier.commerce_nom;
    const price = document.createElement('p');
    price.textContent = `${panier.prix_mad} MAD`;
    const pickup = document.createElement('p');
    pickup.textContent = `Retrait : ${formatPickupTime(panier.retrait_debut)} – ${formatPickupTime(panier.retrait_fin)}`;
    const details = document.createElement('button');
    details.className = 'button button-secondary';
    details.type = 'button';
    details.textContent = 'Voir le détail';
    details.addEventListener('click', () => openBasketDetail(panier.id));
    card.append(title, merchant, price, pickup, details);
    list.append(card);
  }
  showView('catalogue');
}

async function openBasketDetail(id) {
  try {
    const { panier } = await api(`/api/paniers/${encodeURIComponent(id)}`);
    const detail = document.getElementById('basket-detail');
    detail.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = panier.titre;
    const commerce = document.createElement('p');
    commerce.textContent = `Commerce : ${panier.commerce_nom}`;
    const address = document.createElement('p');
    address.textContent = `Adresse : ${panier.commerce_adresse}`;
    const price = document.createElement('p');
    price.textContent = `Prix : ${panier.prix_mad} MAD`;
    const pickup = document.createElement('p');
    pickup.textContent = `Retrait : ${formatPickupTime(panier.retrait_debut)} – ${formatPickupTime(panier.retrait_fin)}`;
    const reserve = document.createElement('button');
    reserve.className = 'button';
    reserve.type = 'button';
    reserve.textContent = 'Réserver';
    reserve.addEventListener('click', () => reserveBasket(panier.id));
    detail.append(title, commerce, address, price, pickup, reserve);
    showView('basket-detail');
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function reserveBasket(basketId) {
  try {
    const result = await api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ panier_id: basketId })
    });
    showFeedback('Panier réservé. Votre réservation est en attente de paiement.');
    await loadReservations();
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function loadReservations() {
  const { reservations } = await api('/api/reservations/me');
  const list = document.getElementById('reservation-list');
  const empty = document.getElementById('reservations-empty');
  list.replaceChildren();
  empty.classList.toggle('hidden', reservations.length > 0);

  for (const reservation of reservations) {
    const card = document.createElement('article');
    card.className = 'basket-card';
    const title = document.createElement('h2');
    title.textContent = reservation.titre;
    const commerce = document.createElement('p');
    commerce.textContent = `Commerce : ${reservation.commerce_nom}`;
    const price = document.createElement('p');
    price.textContent = `Prix : ${reservation.prix_mad} MAD`;
    const pickup = document.createElement('p');
    pickup.textContent = `Retrait : ${formatPickupTime(reservation.retrait_debut)} – ${formatPickupTime(reservation.retrait_fin)}`;
    const status = document.createElement('p');
    status.textContent = `Statut : ${reservation.statut}`;
    card.append(title, commerce, price, pickup, status);
    if (reservation.statut === 'EN_ATTENTE_PAIEMENT') {
      const pay = document.createElement('button');
      pay.className = 'button';
      pay.type = 'button';
      pay.textContent = 'Payer';
      pay.addEventListener('click', () => {
        paymentReservationId = reservation.id;
        document.getElementById('payment-form').reset();
        showFeedback('');
        showView('payment');
      });
      card.append(pay);
    }
    const pickupStart = new Date(reservation.retrait_debut).getTime();
    const canCancel = ['EN_ATTENTE_PAIEMENT', 'CONFIRMEE'].includes(reservation.statut)
      && pickupStart >= Date.now() + 60 * 60 * 1000;
    if (canCancel) {
      const cancel = document.createElement('button');
      cancel.className = 'button button-secondary';
      cancel.type = 'button';
      cancel.textContent = 'Annuler';
      cancel.addEventListener('click', async () => {
        if (!window.confirm('Confirmer l’annulation de cette réservation ?')) return;
        try {
          await api(`/api/reservations/${reservation.id}/annuler`, { method: 'POST' });
          showFeedback('Réservation annulée et panier remis en stock.');
          await loadReservations();
        } catch (error) {
          showFeedback(error.message, true);
        }
      });
      card.append(cancel);
    }
    list.append(card);
  }
  showView('reservations');
}

async function submitForm(form, path, onSuccess) {
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    showFeedback('Compte créé. Vous pouvez maintenant vous connecter.');
    if (onSuccess) await onSuccess(result);
  } catch (error) {
    showFeedback(error.message, true);
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    showFeedback('');
    showView(button.dataset.view);
  });
});

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    localStorage.setItem('token', result.token);
    await openDashboard(result.utilisateur);
    showFeedback('Connexion réussie.');
    form.reset();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('student-register-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, '/api/auth/register');
});

document.getElementById('restaurant-register-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, '/api/commerces/register');
});

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/auth/password', { method: 'PATCH', body: JSON.stringify(body) });
    showFeedback(result.message);
    form.reset();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    localStorage.removeItem('token');
    studentCanBrowse = false;
    logoutButton.classList.add('hidden');
    showView('welcome');
  }
});

document.getElementById('catalogue-button').addEventListener('click', async () => {
  if (!studentCanBrowse) return;
  try {
    await loadCatalogue();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('catalogue-back').addEventListener('click', () => {
  showView('catalogue');
});

document.getElementById('reservations-button').addEventListener('click', async () => {
  try {
    await loadReservations();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('payment-back').addEventListener('click', () => {
  paymentReservationId = null;
  loadReservations().catch((error) => showFeedback(error.message, true));
});

document.getElementById('payment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!paymentReservationId) {
    showFeedback('Aucune réservation à payer.', true);
    return;
  }

  const form = event.currentTarget;
  const cardNumber = new FormData(form).get('numero_carte');
  try {
    const result = await api(`/api/reservations/${paymentReservationId}/paiement`, {
      method: 'POST',
      body: JSON.stringify({ numero_carte: cardNumber })
    });
    paymentReservationId = null;
    form.reset();
    showFeedback(result.message);
    await loadReservations();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('restaurant-baskets-button').addEventListener('click', async () => {
  try {
    await loadRestaurantBaskets();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('incoming-reservations-button').addEventListener('click', async () => {
  try {
    await loadIncomingReservations();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('notifications-button').addEventListener('click', async () => {
  try {
    await loadNotifications();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('basket-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const formData = Object.fromEntries(new FormData(form).entries());
    const payload = {
      ...formData,
      prix_mad: Number(formData.prix_mad),
      quantite: Number(formData.quantite),
      retrait_debut: new Date(formData.retrait_debut).toISOString(),
      retrait_fin: new Date(formData.retrait_fin).toISOString()
    };
    const path = editingBasketId
      ? `/api/commerces/paniers/${editingBasketId}`
      : '/api/commerces/paniers';
    const method = editingBasketId ? 'PUT' : 'POST';
    await api(path, { method, body: JSON.stringify(payload) });
    showFeedback(editingBasketId ? 'Panier modifié.' : 'Panier créé.');
    resetBasketForm();
    await loadRestaurantBaskets();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('cancel-basket-edit').addEventListener('click', resetBasketForm);

document.getElementById('search-filters').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await loadCatalogue();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('search-filters').addEventListener('reset', () => {
  window.setTimeout(() => {
    loadCatalogue().catch((error) => showFeedback(error.message, true));
  }, 0);
});

async function restoreSession() {
  const token = localStorage.getItem('token');
  if (!token) return showView('welcome');

  try {
    const result = await api('/api/auth/me');
    await openDashboard(result.utilisateur);
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem('token');
    } else {
      showFeedback(error.message, true);
    }
    showView('welcome');
  }
}

restoreSession();
