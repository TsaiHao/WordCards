const port = 12300;
const url = `http://localhost:${port}`;

const onCardClicked = async (event) => {
    const word = event.target.querySelector('h2').textContent;
    console.log(`Card clicked ${word}`);
}

const container = document.querySelector('.grid');
let masonry = new Masonry(container, {
    itemSelector: '.grid-item',
    columnWidth: 10,
});

function makeCard(word, definition) {
    const card = document.createElement('div');
    card.className = "grid-item";

    const title = document.createElement('h2');
    const dictLink = document.createElement('a');
    dictLink.className = "dict-link";
    dictLink.href = `https://www.merriam-webster.com/dictionary/${word}`;
    dictLink.target = "_blank";
    dictLink.textContent = word;
    title.appendChild(dictLink);
    card.appendChild(title);

    for (const def of JSON.parse(definition)) {
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
});

document.querySelector('#add-word-button').addEventListener('click', async () => {
    const newWord = document.querySelector('#new-word-input').value;
    fetch(url + "/word/" + newWord).then(response => {
        return response.json();
    }).then(json => {
        const result = json.result;
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
