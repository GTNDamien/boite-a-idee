const API_URL = "https://script.google.com/macros/s/AKfycbzcW1FG9vekk1b1zrqtS9MwJgDCmUKUXIt6gMF-mUUVnzskBRF6O1l_odpH1QvsxeWrGQ/exec";

let ideas=[];

let currentCategory="Toutes";

async function init(){

    const response=await fetch(API_URL);

    ideas=await response.json();

    renderCategories();

    renderIdeas();

}

function renderCategories(){

    const container=document.getElementById("categories");

    container.innerHTML="";

    const categories=[

        "Toutes",

        ...new Set(ideas.map(i=>i.categorie))

    ];

    categories.forEach(cat=>{

        const btn=document.createElement("div");

        btn.className="category";

        if(cat==="Toutes")

            btn.classList.add("active");

        btn.textContent=cat;

        btn.onclick=()=>{

            document.querySelectorAll(".category")

                .forEach(c=>c.classList.remove("active"));

            btn.classList.add("active");

            currentCategory=cat;

            renderIdeas();

        };

        container.appendChild(btn);

    });

}

function renderIdeas(){

    const container=document.getElementById("ideas");

    container.innerHTML="";

    const filtered=currentCategory==="Toutes"

        ? ideas

        : ideas.filter(i=>i.categorie===currentCategory);

    filtered.forEach(idea=>{

        const card=document.createElement("div");

        card.className="card";

        card.innerHTML=`

            <h2>${idea.titre}</h2>

            <div class="badge">

                ${idea.categorie}

            </div>

            <p>${idea.description}</p>

            <br>

            ❤️ ${idea.likes}

        `;

        container.appendChild(card);

    });

}

init();