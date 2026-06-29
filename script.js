const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas = [];
let currentCategory = "Toutes";
let currentSort = "popular"; // "popular" | "newest" | "oldest"

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
  const response = await fetch(API_URL + "?action=ideas");
  ideas = await response.json();

  updateStats();
  renderCategories();
  renderIdeas();
  bindSortButtons();
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
    case "popular":
      return copy.sort((a, b) => b.likes - a.likes);
    case "newest":
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case "oldest":
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    default:
      return copy;
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
          onclick="event.stopPropagation(); likeIdea(${idea.id}, this)"
          aria-label="${voted ? "Retirer mon vote" : "Voter pour cette idée"}"
        >
          ${voted ? "✔ Voté" : "❤️ J'aime"}
          <span class="like-count">${idea.likes}</span>
        </button>
      </div>
    `;

    card.onclick = () => openIdea(idea);
    container.appendChild(card);
  });
}

/* ============================================================
   LIKE
============================================================ */
async function likeIdea(id, button) {
  if (hasVoted(id)) {
    const confirmed = window.confirm("Vous avez déjà voté. Retirer votre vote ?");
    if (confirmed) await unlikeIdea(id, button);
    return;
  }

  const countEl = button.querySelector(".like-count");
  const current = Number(countEl.textContent);
  const idea = ideas.find(i => i.id === id);

  // Mise à jour optimiste
  if (idea) idea.likes++;
  button.classList.add("voted-btn");
  button.innerHTML = `✔ Voté <span class="like-count">${current + 1}</span>`;
  localStorage.setItem("liked_" + id, true);

  const card = button.closest(".card");
  if (card) card.classList.add("voted");
  updateStats();

  try {
    const response = await fetch(API_URL + "?action=like&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      // Rollback
      if (idea) idea.likes--;
      localStorage.removeItem("liked_" + id);
      button.classList.remove("voted-btn");
      button.innerHTML = `❤️ J'aime <span class="like-count">${current}</span>`;
      if (card) card.classList.remove("voted");
      updateStats();
      alert(result.message || "Impossible d'enregistrer votre vote.");
    }
  } catch {
    // Rollback réseau
    if (idea) idea.likes--;
    localStorage.removeItem("liked_" + id);
    button.classList.remove("voted-btn");
    button.innerHTML = `❤️ J'aime <span class="like-count">${current}</span>`;
    if (card) card.classList.remove("voted");
    updateStats();
    alert("Erreur réseau. Veuillez réessayer.");
  }
}

async function unlikeIdea(id, button) {
  const idea = ideas.find(i => i.id === id);
  const current = idea ? idea.likes : 0;
  const newCount = Math.max(0, current - 1);

  // Mise à jour optimiste
  if (idea) idea.likes = newCount;
  localStorage.removeItem("liked_" + id);

  const card = button.closest(".card");
  if (card) card.classList.remove("voted");
  button.classList.remove("voted-btn");
  button.innerHTML = `❤️ J'aime <span class="like-count">${newCount}</span>`;
  updateStats();

  try {
    const response = await fetch(API_URL + "?action=unlike&id=" + id + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      // Rollback
      if (idea) idea.likes = current;
      localStorage.setItem("liked_" + id, true);
      if (card) card.classList.add("voted");
      button.classList.add("voted-btn");
      button.innerHTML = `✔ Voté <span class="like-count">${current}</span>`;
      updateStats();
      alert(result.message || "Impossible de retirer le vote.");
    }
  } catch {
    // Rollback réseau
    if (idea) idea.likes = current;
    localStorage.setItem("liked_" + id, true);
    if (card) card.classList.add("voted");
    button.classList.add("voted-btn");
    button.innerHTML = `✔ Voté <span class="like-count">${current}</span>`;
    updateStats();
    alert("Erreur réseau. Veuillez réessayer.");
  }
}

/* ============================================================
   MODAL
============================================================ */
function openIdea(idea) {
  const voted = hasVoted(idea.id);
  const modal = document.getElementById("modal");
  modal.classList.remove("hidden");

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
      onclick="likeFromModal(${idea.id}, this)"
    >
      ${voted
        ? `<span>✔</span> Vous avez déjà voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`
        : `<span>❤️</span> Voter pour cette idée · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`
      }
    </button>
  `;
}

async function likeFromModal(id, button) {
  await likeIdea(id, button);

  // Rafraîchit le texte du bouton modal après action
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  const voted = hasVoted(id);

  if (voted) {
    button.classList.add("voted-btn");
    button.innerHTML = `<span>✔</span> Vous avez déjà voté · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`;
  } else {
    button.classList.remove("voted-btn");
    button.innerHTML = `<span>❤️</span> Voter pour cette idée · ${idea.likes} vote${idea.likes > 1 ? "s" : ""}`;
  }
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

init();