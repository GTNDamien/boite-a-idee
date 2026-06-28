const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas = [];
let currentCategory = "Toutes";

// UUID unique du navigateur
let uuid = localStorage.getItem("uuid");

if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem("uuid", uuid);
}

async function init(){

    const response = await fetch(API_URL + "?action=ideas");

    ideas = await response.json();

    renderCategories();

    renderIdeas();

}

function renderCategories(){

    const container = document.getElementById("categories");

    container.innerHTML = "";

    const categories = [
        "Toutes",
        ...new Set(ideas.map(i => i.categorie))
    ];

    categories.forEach(cat => {

        const btn = document.createElement("div");

        btn.className = "category";

        if(cat==="Toutes")
            btn.classList.add("active");

        btn.textContent = cat;

        btn.onclick = () => {

            document.querySelectorAll(".category")
                .forEach(c => c.classList.remove("active"));

            btn.classList.add("active");

            currentCategory = cat;

            renderIdeas();

        };

        container.appendChild(btn);

    });

}

function renderIdeas(){

    const container = document.getElementById("ideas");

    container.innerHTML = "";

    const filtered = currentCategory==="Toutes"
        ? ideas
        : ideas.filter(i => i.categorie===currentCategory);

    filtered.forEach(idea => {

        const card = document.createElement("div");

        card.className = "card";

        card.innerHTML = `

            <h2>${idea.titre}</h2>

            <div class="badge">
                ${idea.categorie}
            </div>

            <p>${idea.description}</p>

            <button class="likeButton" onclick="likeIdea(${idea.id}, this)">

                ❤️ <span>${idea.likes}</span>

            </button>

        `;

        card.onclick = (e)=>{

            if(e.target.tagName==="BUTTON") return;

            openIdea(idea);

        };

        container.appendChild(card);

    });

}

async function likeIdea(id, button){

    // déjà voté ?

    if(localStorage.getItem("liked_"+id)){

        alert("Vous avez déjà voté pour cette idée.");

        return;

    }

    const span = button.querySelector("span");

    const current = Number(span.textContent);

    // mise à jour instantanée

    span.textContent = current + 1;

    const idea = ideas.find(i => i.id === id);

    if (idea) {
        idea.likes++;
    }

    button.disabled = true;

    button.style.opacity = .7;

    localStorage.setItem("liked_"+id,true);

    const response = await fetch(

        API_URL +
        "?action=like&id="+id+
        "&uuid="+uuid

    );

    const result = await response.json();

    if(!result.success){

        // Remet le compteur affiché
        span.textContent = current;

        // Remet aussi la valeur dans le tableau ideas
        const idea = ideas.find(i => i.id === id);

        if(idea){
            idea.likes--;
        }

        // Réactive le bouton
        button.disabled = false;
        button.style.opacity = 1;

        localStorage.removeItem("liked_"+id);

        alert(result.message);

    }

}


init();

function openIdea(idea){

    document.getElementById("modal").classList.remove("hidden");

    document.getElementById("modalBody").innerHTML=`

        <h2>${idea.titre}</h2>

        <div class="badge">

            ${idea.categorie}

        </div>

        <div class="section">

            <h3>📝 Description</h3>

            <p>${idea.description}</p>

        </div>

        <div class="section">

            <h3>🚀 Pourquoi cette idée ?</h3>

            <p>${idea.pourquoi}</p>

        </div>

        <div class="section">

            <h3>👤 Auteur</h3>

            <p>${idea.auteur}</p>

        </div>

        <div class="section">

            <button
            class="likeButton"
            onclick="likeIdea(${idea.id},this)">

            ❤️ ${idea.likes}

            </button>

        </div>

    `;

}

document
.getElementById("closeModal")
.onclick=()=>{

    document
    .getElementById("modal")
    .classList
    .add("hidden");

};

window.onclick=(e)=>{

    if(e.target.id==="modal"){

        document
        .getElementById("modal")
        .classList
        .add("hidden");

    }

};