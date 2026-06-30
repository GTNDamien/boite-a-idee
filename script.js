const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas = [];
let currentCategory = "Toutes";
let currentSort = "popular";

// Liste des ids votés par cet UUID, telle que renvoyée par le serveur
// (source de vérité = Google Sheet, pas le localStorage)
let votedIds = new Set();

// UUID unique du navigateur
let uuid = localStorage.getItem("uuid");
if (!uuid) {
  uuid = crypto.randomUUID();
  localStorage.setItem("uuid", uuid);
}

// Idées dont une requête réseau (like/unlike) est en cours
let pendingIds = new Set();

// Idea id -> "like" | "unlike" : dernière action voulue par l'utilisateur,
// en attente d'envoi car une requête précédente est encore en vol
let queuedAction = new Map();

let pollInterval = null;

/* ============================================================
   THÈME
============================================================ */
function initTheme() {
  const saved = localStorage.getItem("theme"); // "light" ou "dark"
  const isLight = saved === "light"; // pas de valeur enregistrée -> sombre par défaut
  document.body.classList.toggle("light", isLight);
  const toggleBtn = document.getElementById("themeToggle");
  if (toggleBtn) toggleBtn.textContent = isLight ? "🌙" : "☀️";
}

function bindThemeToggle() {
  const toggleBtn = document.getElementById("themeToggle");
  if (!toggleBtn) return;
  toggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    toggleBtn.textContent = isLight ? "🌙" : "☀️";
  });
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  initTheme();
  bindThemeToggle();

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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIdeas();
  });
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(refreshIdeas, 10_000);
}

/* ============================================================
   RAFRAÎCHISSEMENT
============================================================ */
async function refreshIdeas() {
  // Tant qu'une requête ou une action en attente existe pour une idée,
  // on ne touche pas à l'état local (évite d'écraser une mise à jour
  // optimiste en plein vol).
  if (pendingIds.size > 0 || queuedAction.size > 0) return;

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

    const btn = card.querySelector(".likeButton");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVote(idea.id);
    });

    card.addEventListener("click", () => openIdea(idea.id));
    container.appendChild(card);
  });
}

/* ============================================================
   VOTE — bascule instantanée + file d'attente réseau
   On ne bloque plus jamais le clic : l'UI réagit immédiatement
   à chaque clic, et seules les requêtes serveur sont sérialisées
   en arrière-plan, une par une, pour chaque idée.
============================================================ */
function toggleVote(id) {
  const numId = Number(id);
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  if (hasVoted(id)) {
    idea.likes = Math.max(0, idea.likes - 1);
    votedIds.delete(numId);
  } else {
    idea.likes++;
    votedIds.add(numId);
  }

  updateStats();
  renderIdeas();

  // Resynchronise le bouton de la modal si elle est ouverte sur cette idée
  const modal = document.getElementById("modal");
  if (!modal.classList.contains("hidden")) {
    const modalBtn = modal.querySelector(".modal-like-btn");
    if (modalBtn && modalBtn.dataset.ideaId === String(id)) {
      syncModalButton(id, modalBtn);
    }
  }

  // L'action à envoyer au serveur correspond toujours à l'état qu'on
  // vient d'atteindre côté UI
  const desired = hasVoted(id) ? "like" : "unlike";
  queuedAction.set(numId, desired);

  processQueue(numId);
}

async function processQueue(numId) {
  if (pendingIds.has(numId)) return; // une requête est déjà en vol, elle relira la queue à la fin
  const action = queuedAction.get(numId);
  if (!action) return;

  queuedAction.delete(numId);
  pendingIds.add(numId);

  try {
    const response = await fetch(API_URL + "?action=" + action + "&id=" + numId + "&uuid=" + uuid);
    const result = await response.json();

    if (!result.success) {
      // Désaccord avec le serveur (ex: déjà voté/retiré ailleurs) -> resynchronise
      await refreshIdeas();
    }
  } catch {
    alert("Erreur réseau. Veuillez réessayer.");
    await refreshIdeas();
  } finally {
    pendingIds.delete(numId);
    // Si l'utilisateur a re-cliqué pendant que la requête était en vol,
    // on envoie immédiatement le nouvel état désiré
    if (queuedAction.has(numId)) {
      processQueue(numId);
    }
  }
}

/* ============================================================
   MODAL
============================================================ */
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
      data-idea-id="${idea.id}"
      onclick="toggleVote(${idea.id})"
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