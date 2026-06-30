const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas = [];
let currentCategory = "Toutes";
let currentSort = "popular";

// UUID unique du navigateur
let uuid = localStorage.getItem("uuid");
if (!uuid) {
  uuid = crypto.randomUUID();
  localStorage.setItem("uuid", uuid);
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  try {
    const response = await fetch(API_URL + "?action=ideas&t=" + Date.now());
    ideas = await response.json();
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

  // Rafraîchit toutes les 30 secondes (sessions longues)
  setInterval(refreshIdeas, 30_000);

  // Rafraîchit aussi quand l'utilisateur revient sur l'onglet
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIdeas();
  });
}

/* ============================================================
   RAFRAÎCHISSEMENT (récupère les votes des autres utilisateurs)
============================================================ */
async function refreshIdeas() {
  try {
    const response = await fetch(API_URL + "?action=ideas&t=" + Date.now());
    const fresh = await response.json();

    fresh.forEach(freshIdea => {
      const local = ideas.find(i => i.id === freshIdea.id);
      if (local) local.likes = freshIdea.likes;
    });

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
  return !!localStorage.getItem("liked_" + id);
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
        >
          ${voted ? "✔ Voté" : "❤️ J'aime"}
          <span class="like-count">${idea.likes}</span>
        </button>
      </div>
    `;

    // Listener attaché directement sur l'élément créé pour CETTE idée précise
    // (évite tout bug de fermeture / mauvais id sur un autre bouton)
    const btn = card.querySelector(".likeButton");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCardVote(idea.id, btn);
    });

    card.addEventListener("click", () => openIdea(idea));
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
============================================================ */
async function handleCardVote(id, button) {
  button.disabled = true;
  if (hasVoted(id)) {
    const confirmed = window.confirm("Vous avez déjà voté. Retirer votre vote ?");
    if (confirmed) await doUnlike(id);
  } else {
    await doLike(id);
  }
  button.disabled = false;
}

/* ============================================================
   GESTIONNAIRE VOTE DEPUIS LA MODAL
============================================================ */
async function handleModalVote(id, modalButton) {
  if (hasVoted(id)) {
    const confirmed = window.confirm("Vous avez déjà voté. Retirer votre vote ?");
    if (!confirmed) return;
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
    modalButton.innerHTML = `<span>✔</span> Vous avez déjà voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`;
  } else {
    modalButton.classList.remove("voted-btn");
    modalButton.innerHTML = `<span>❤️</span> Voter pour cette idée · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`;
  }
}

/* ============================================================
   LOGIQUE LIKE
============================================================ */
async function doLike(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  const previous = idea.likes;

  idea.likes++;
  localStorage.setItem("liked_" + id, true);
  updateStats();

  const cardBtn = getCardButton(id);
  const card = cardBtn ? cardBtn.closest(".card") : null;
  if (card) card.classList.add("voted");
  if (cardBtn) setCardButtonVoted(cardBtn, idea.likes);

  try {
    const response = await fetch(API_URL + "?action=like&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      idea.likes = previous;
      localStorage.removeItem("liked_" + id);
      updateStats();
      if (card) card.classList.remove("voted");
      if (cardBtn) setCardButtonUnvoted(cardBtn, idea.likes);
      alert(result.message || "Impossible d'enregistrer votre vote.");
    }
  } catch {
    idea.likes = previous;
    localStorage.removeItem("liked_" + id);
    updateStats();
    if (card) card.classList.remove("voted");
    if (cardBtn) setCardButtonUnvoted(cardBtn, idea.likes);
    alert("Erreur réseau. Veuillez réessayer.");
  }
}

/* ============================================================
   LOGIQUE UNLIKE
============================================================ */
async function doUnlike(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  const previous = idea.likes;

  idea.likes = Math.max(0, idea.likes - 1);
  localStorage.removeItem("liked_" + id);
  updateStats();

  const cardBtn = getCardButton(id);
  const card = cardBtn ? cardBtn.closest(".card") : null;
  if (card) card.classList.remove("voted");
  if (cardBtn) setCardButtonUnvoted(cardBtn, idea.likes);

  try {
    const response = await fetch(API_URL + "?action=unlike&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      idea.likes = previous;
      localStorage.setItem("liked_" + id, true);
      updateStats();
      if (card) card.classList.add("voted");
      if (cardBtn) setCardButtonVoted(cardBtn, idea.likes);
      alert(result.message || "Impossible de retirer le vote.");
    }
  } catch {
    idea.likes = previous;
    localStorage.setItem("liked_" + id, true);
    updateStats();
    if (card) card.classList.add("voted");
    if (cardBtn) setCardButtonVoted(cardBtn, idea.likes);
    alert("Erreur réseau. Veuillez réessayer.");
  }
}

/* ============================================================
   MODAL
============================================================ */
function openIdea(idea) {
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
        ? `<span>✔</span> Vous avez déjà voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`
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