const port = 12300;
const url = `http://localhost:${port}`;

const container = document.querySelector('.grid');
let masonry = new Masonry(container, {
    itemSelector: '.card',
    columnWidth: 10,
});

let activeCard = null;

const onCardClicked = async (event) => {
    let element = event.target;
    while (element !== null && !element.classList.contains("card")) {
        element = element.parentNode;
    }
    if (!element) {
        return
    }
    const word = element.querySelector('h2').textContent;
    console.log(`Card clicked ${word}`);

    if (activeCard && activeCard !== element) {
        activeCard.classList.remove("card-active");
    }

    if (element.classList.contains("card-active")) {
        element.classList.remove("card-active");
    } else {
        activeCard = element;
        element.classList.add("card-active");
    }
}

addEventListener('keydown', (event) => {
    if (event.ctrlKey) {
        if (event.key === 'c') {
            console.log("Ctrl+C pressed");
            if (activeCard) {
                fetch(url + "/ai/" + activeCard.querySelector('h2').textContent, {
                    method: 'GET',
                    headers: {
                        word: activeCard.querySelector('h2').textContent,
                        what: "HowToUse",
                    }
                }).then(response => {
                    return response.json();
                }).then(json => {
                    console.log(json);
                });
            }
        }
    }
})

const onCardDeleteClicked = async (event) => {
    event.stopPropagation();

    let node = event.target;
    while (node !== null && node.className !== "card") {
        node = node.parentNode;
    }

    if (!node) {
        console.error("Delete button not found, parent class is ", item.className);
        return;
    }
    const word = node.querySelector('h2').textContent;
    console.log(`Card delete clicked ${word}`);

    fetch(url + "/word/" + word, {
        method: 'DELETE',
    }).then(response => {
        if (response.status !== 200) {
            console.error("Failed to delete word", response.status);
        }
        return response.json();
    }).then(json => {
        if (json.message !== "success") {
            console.error("Failed to delete word", json);
        }
    });
    masonry.remove(node);
}

function makeCard(word, definition) {
    const card = document.createElement('div');
    card.className = "card";

    const title = document.createElement('h2');
    const dictLink = document.createElement('a');
    dictLink.className = "dict-link";
    dictLink.href = `https://dictionary.cambridge.org/dictionary/english/${word}`;
    dictLink.target = "_blank";
    dictLink.textContent = word;
    title.appendChild(dictLink);
    card.appendChild(title);
    const deleteButton = document.createElement('button');
    deleteButton.className = "delete-word-button";
    deleteButton.innerHTML = `
      <svg viewBox="0 0 24 24">
        <line x1="0" y1="0" x2="24" y2="24" stroke="black" stroke-width="2"></line>
        <line x1="0" y1="24" x2="24" y2="0" stroke="black" stroke-width="2"></line>
      </svg>
    `;
    deleteButton.addEventListener('click', onCardDeleteClicked);
    card.appendChild(deleteButton);

    if (typeof definition === 'string') {
        definition = JSON.parse(definition);
    }
    for (const def of definition) {
        const h3 = document.createElement('h3');
        const fl = def.fl;
        h3.textContent = `[${fl}]`;
        card.appendChild(h3);

        for (const shortdef of def.shortdef) {
            const description = document.createElement('p');
            description.textContent = shortdef;
            card.appendChild(description);
        }
    }

    card.addEventListener('click', onCardClicked);
    return card;
}


fetch(url + "/list").then(response => {
    return response.json();
}).then(json => {
    let cardRow = [];
    let fragment = document.createDocumentFragment();
    for (let i = 0; i < json.length; i++) {
        const card = makeCard(json[i].word, json[i].definition);
        cardRow.push(card);
        fragment.appendChild(card);
        if (cardRow.length === 3) {
            container.appendChild(fragment);
            masonry.appended(cardRow);
            cardRow = [];
            fragment = document.createDocumentFragment();
        }
    }
    if (cardRow.length > 0) {
        container.appendChild(fragment);
        masonry.appended(cardRow);
    }
});

document.querySelector('#add-word-button').addEventListener('click', async () => {
    const newWord = document.querySelector('#new-word-input').value;
    fetch(url + "/word/" + newWord, {
        method: "PUT"
    }).then(response => {
        return response.json();
    }).then(json => {
        const result = json.message;
        if (result === "new") {
            console.log(`New word ${newWord}`);
            const card = makeCard(newWord, json.definition);
            container.prepend(card);
            masonry.prepended(card);
        } else if (result === "duplicate") {
            console.log(`Duplicate word ${newWord}`);
            alert(`Word ${newWord} already exists!`);
        } else if (result === "spell_check") {
            console.log(`Spell check ${newWord}`);
            let warning = "";
            for (const suggestion of json.suggestions) {
                warning += `${suggestion}, `;
            }
            alert(`Did you mean ${warning}?`);
        } else {
            console.log(`Unknown result ${result}`);
        }
    }).catch(error => {
        console.log(error);
    });
});
