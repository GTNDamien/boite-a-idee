const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas = [];
let currentCategory = "Toutes";
let currentSort = "popular";

// Liste des ids votés par cet UUID, telle que renvoyée par le serveur
// (source de vérité = Google Sheet, pas le localStorage)
let votedIds = new Set();

// UUID unique du navigateur (sert uniquement à s'identifier auprès du serveur,
// le compteur et le statut "voté" viennent toujours du Sheet)
let uuid = localStorage.getItem("uuid");
if (!uuid) {
  uuid = crypto.randomUUID();
  localStorage.setItem("uuid", uuid);
}

// Idées dont le vote/retrait est actuellement en cours de traitement
// (empêche tout chevauchement de requête like/unlike sur la même idée)
let pendingIds = new Set();

let pollInterval = null;

/* ============================================================
   INIT
============================================================ */
async function init() {
  try {
    const [ideasRes, votesRes] = await Promise.all([
      fetch(API_URL + "?action=ideas&t=" + Date.now()),
      fetch(API_URL + "?action=myVotes&uuid=" + uuid + "&t=" + Date.now())
    ]);
    ideas = await ideasRes.json();
    const myVotes = await votesRes.json();
    votedIds = new Set(myVotes.map(Number));
  } catch (e) {
    console.error("Erreur de chargement initial :", e);
    document.getElementById("ideas").innerHTML =
      "<p style='padding:40px;text-align:center;color:#999;'>Impossible de charger les idées. Réessayez plus tard.</p>";
    return;
  }

  updateStats();
  renderCategories();
  renderIdeas();
  bindSortButtons();

  startPolling();

  // Rafraîchit aussi quand l'utilisateur revient sur l'onglet
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIdeas();
  });
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(refreshIdeas, 10_000);
}

/* ============================================================
   RAFRAÎCHISSEMENT (récupère les votes des autres utilisateurs
   ET la vérité serveur sur les votes de cet UUID)
============================================================ */
async function refreshIdeas() {
  // Si un vote/retrait est en cours pour une idée, on ne touche pas
  // à son état tant que la requête n'est pas terminée — évite
  // qu'un refresh automatique n'écrase une mise à jour optimiste
  // en plein vol et ne crée un état incohérent.
  if (pendingIds.size > 0) return;

  try {
    const [ideasRes, votesRes] = await Promise.all([
      fetch(API_URL + "?action=ideas&t=" + Date.now()),
      fetch(API_URL + "?action=myVotes&uuid=" + uuid + "&t=" + Date.now())
    ]);
    const fresh = await ideasRes.json();
    const myVotes = await votesRes.json();

    fresh.forEach(freshIdea => {
      const local = ideas.find(i => i.id === freshIdea.id);
      if (local) local.likes = freshIdea.likes;
    });

    votedIds = new Set(myVotes.map(Number));

    updateStats();
    renderIdeas();
  } catch (e) {
    console.warn("Rafraîchissement échoué", e);
  }
}

/* ============================================================
   STATS HERO
============================================================ */
function updateStats() {
  const totalVotes = ideas.reduce((acc, i) => acc + i.likes, 0);
  document.getElementById("statIdeas").textContent = ideas.length;
  document.getElementById("statVotes").textContent = totalVotes;
}

/* ============================================================
   CATÉGORIES
============================================================ */
function renderCategories() {
  const container = document.getElementById("categories");
  container.innerHTML = "";
  const categories = ["Toutes", ...new Set(ideas.map(i => i.categorie))];
  categories.forEach(cat => {
    const btn = document.createElement("div");
    btn.className = "category" + (cat === "Toutes" ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => {
      document.querySelectorAll(".category").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = cat;
      renderIdeas();
    };
    container.appendChild(btn);
  });
}

/* ============================================================
   TRI
============================================================ */
function bindSortButtons() {
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      renderIdeas();
    };
  });
}

function getSortedIdeas(list) {
  const copy = [...list];
  switch (currentSort) {
    case "popular": return copy.sort((a, b) => b.likes - a.likes);
    case "newest":  return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case "oldest":  return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    default:        return copy;
  }
}

/* ============================================================
   RENDU DES IDÉES
============================================================ */
function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function hasVoted(id) {
  return votedIds.has(Number(id));
}

function isPending(id) {
  return pendingIds.has(Number(id));
}

function renderIdeas() {
  const container = document.getElementById("ideas");
  const emptyState = document.getElementById("emptyState");
  container.innerHTML = "";

  const filtered = currentCategory === "Toutes"
    ? ideas
    : ideas.filter(i => i.categorie === currentCategory);

  const sorted = getSortedIdeas(filtered);

  if (sorted.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  sorted.forEach(idea => {
    const voted = hasVoted(idea.id);
    const pending = isPending(idea.id);

    const card = document.createElement("div");
    card.className = "card" + (voted ? " voted" : "");
    card.dataset.ideaId = String(idea.id);

    card.innerHTML = `
      <div class="card-header">
        <h2>${escHtml(idea.titre)}</h2>
        <span class="vote-badge">✔ Voté</span>
      </div>
      <div class="badge">${escHtml(idea.categorie)}</div>
      <p>${escHtml(idea.description)}</p>
      <div class="card-footer">
        <span class="card-date">${formatDate(idea.date)}</span>
        <button
          class="likeButton ${voted ? "voted-btn" : ""}"
          aria-label="${voted ? "Retirer mon vote" : "Voter pour cette idée"}"
          ${pending ? "disabled" : ""}
        >
          ${voted ? "✔ Voté" : "❤️ J'aime"}
          <span class="like-count">${idea.likes}</span>
        </button>
      </div>
    `;

    // Listener attaché directement sur l'élément créé pour CETTE idée précise
    const btn = card.querySelector(".likeButton");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCardVote(idea.id, btn);
    });

    card.addEventListener("click", () => openIdea(idea.id));
    container.appendChild(card);
  });
}

/* ============================================================
   UTILITAIRES UI — mise à jour d'un bouton de CARD
============================================================ */
function setCardButtonVoted(button, count) {
  button.classList.add("voted-btn");
  button.innerHTML = `✔ Voté <span class="like-count">${count}</span>`;
  button.setAttribute("aria-label", "Retirer mon vote");
}

function setCardButtonUnvoted(button, count) {
  button.classList.remove("voted-btn");
  button.innerHTML = `❤️ J'aime <span class="like-count">${count}</span>`;
  button.setAttribute("aria-label", "Voter pour cette idée");
}

/* Retrouve le bouton de card pour un ideaId donné */
function getCardButton(id) {
  const card = document.querySelector(`.card[data-idea-id="${id}"]`);
  return card ? card.querySelector(".likeButton") : null;
}

/* ============================================================
   GESTIONNAIRE VOTE DEPUIS UNE CARD
   Plus de confirmation : un clic sur "Voté" retire directement
   le vote, exactement comme un clic sur "J'aime" l'ajoute.
============================================================ */
async function handleCardVote(id, button) {
  if (isPending(id)) return; // requête déjà en cours pour cette idée, on ignore

  if (hasVoted(id)) {
    await doUnlike(id);
  } else {
    await doLike(id);
  }
}

/* ============================================================
   GESTIONNAIRE VOTE DEPUIS LA MODAL
============================================================ */
async function handleModalVote(id, modalButton) {
  if (isPending(id)) return; // requête déjà en cours (ex: lancée depuis la card), on ignore

  if (hasVoted(id)) {
    await doUnlike(id);
  } else {
    await doLike(id);
  }
  syncModalButton(id, modalButton);
}

/* Met à jour le bouton modal selon l'état actuel */
function syncModalButton(id, modalButton) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  const voted = hasVoted(id);
  if (voted) {
    modalButton.classList.add("voted-btn");
    modalButton.innerHTML = `<span>✔</span> Vous avez voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""} · cliquer pour retirer`;
  } else {
    modalButton.classList.remove("voted-btn");
    modalButton.innerHTML = `<span>❤️</span> Voter pour cette idée · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`;
  }
}

/* ============================================================
   AIDE — bascule l'état "pending" d'un bouton en douceur
   (via requestAnimationFrame pour laisser le navigateur peindre
   le changement de texte/classe avant de désactiver le bouton,
   ce qui évite le petit "saut" visuel ressenti auparavant)
============================================================ */
function setPendingState(button, pending) {
  if (!button) return;
  if (pending) {
    requestAnimationFrame(() => { button.disabled = true; });
  } else {
    button.disabled = false;
  }
}

/* ============================================================
   LOGIQUE LIKE
   pendingIds verrouille l'idée pour toute la durée de l'appel,
   quel que soit l'endroit (card ou modal) qui l'a déclenché.
============================================================ */
async function doLike(id) {
  const numId = Number(id);
  if (pendingIds.has(numId)) return;
  pendingIds.add(numId);

  const idea = ideas.find(i => i.id === id);
  if (!idea) { pendingIds.delete(numId); return; }
  const previous = idea.likes;

  idea.likes++;
  votedIds.add(numId);
  updateStats();

  const cardBtn = getCardButton(id);
  const card = cardBtn ? cardBtn.closest(".card") : null;
  if (card) card.classList.add("voted");
  if (cardBtn) {
    setCardButtonVoted(cardBtn, idea.likes);
    setPendingState(cardBtn, true);
  }

  try {
    const response = await fetch(API_URL + "?action=like&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      idea.likes = previous;
      votedIds.delete(numId);
      updateStats();
      if (card) card.classList.remove("voted");
      if (cardBtn) setCardButtonUnvoted(cardBtn, idea.likes);
    }
  } catch {
    idea.likes = previous;
    votedIds.delete(numId);
    updateStats();
    if (card) card.classList.remove("voted");
    if (cardBtn) setCardButtonUnvoted(cardBtn, idea.likes);
    alert("Erreur réseau. Veuillez réessayer.");
  } finally {
    pendingIds.delete(numId);
    const btnNow = getCardButton(id);
    setPendingState(btnNow, false);
  }
}

/* ============================================================
   LOGIQUE UNLIKE
============================================================ */
async function doUnlike(id) {
  const numId = Number(id);
  if (pendingIds.has(numId)) return;
  pendingIds.add(numId);

  const idea = ideas.find(i => i.id === id);
  if (!idea) { pendingIds.delete(numId); return; }
  const previous = idea.likes;

  idea.likes = Math.max(0, idea.likes - 1);
  votedIds.delete(numId);
  updateStats();

  const cardBtn = getCardButton(id);
  const card = cardBtn ? cardBtn.closest(".card") : null;
  if (card) card.classList.remove("voted");
  if (cardBtn) {
    setCardButtonUnvoted(cardBtn, idea.likes);
    setPendingState(cardBtn, true);
  }

  try {
    const response = await fetch(API_URL + "?action=unlike&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      idea.likes = previous;
      votedIds.add(numId);
      updateStats();
      if (card) card.classList.add("voted");
      if (cardBtn) setCardButtonVoted(cardBtn, idea.likes);
    }
  } catch {
    idea.likes = previous;
    votedIds.add(numId);
    updateStats();
    if (card) card.classList.add("voted");
    if (cardBtn) setCardButtonVoted(cardBtn, idea.likes);
    alert("Erreur réseau. Veuillez réessayer.");
  } finally {
    pendingIds.delete(numId);
    const btnNow = getCardButton(id);
    setPendingState(btnNow, false);
  }
}

/* ============================================================
   MODAL
   On référence toujours l'idée par son id et on relit depuis
   le tableau `ideas` au moment de l'affichage, pour ne jamais
   utiliser un objet idea potentiellement obsolète (capturé
   avant un vote en cours par exemple).
============================================================ */
function openIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  const voted = hasVoted(idea.id);
  document.getElementById("modal").classList.remove("hidden");

  document.getElementById("modalBody").innerHTML = `
    <div class="modal-badge">${escHtml(idea.categorie)}</div>
    <h2 class="modal-title">${escHtml(idea.titre)}</h2>
    <div class="modal-divider"></div>
    <div class="section">
      <h3>📝 Description</h3>
      <p>${escHtml(idea.description)}</p>
    </div>
    <div class="section">
      <h3>🚀 Pourquoi cette idée ?</h3>
      <p>${escHtml(idea.pourquoi)}</p>
    </div>
    <div class="section">
      <h3>👤 Auteur</h3>
      <p>${escHtml(idea.auteur)}</p>
    </div>
    <button
      class="modal-like-btn ${voted ? "voted-btn" : ""}"
      onclick="handleModalVote(${idea.id}, this)"
    >
      ${voted
        ? `<span>✔</span> Vous avez voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""} · cliquer pour retirer`
        : `<span>❤️</span> Voter pour cette idée · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`
      }
    </button>
  `;
}

/* ============================================================
   FERMETURE MODAL
============================================================ */
document.getElementById("closeModal").onclick = () => {
  document.getElementById("modal").classList.add("hidden");
};

window.onclick = e => {
  if (e.target.id === "modal") {
    document.getElementById("modal").classList.add("hidden");
  }
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.getElementById("modal").classList.add("hidden");
  }
});

/* ============================================================
   UTILITAIRES
============================================================ */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ============================================================
   LANCEMENT
============================================================ */
init();