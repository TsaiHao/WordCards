const port = 12300;
const url = `http://localhost:${port}`;

let AllList = {};
let ActiveWordDiv = null;
let AIFetchController = new AbortController();

function convertToHTML(inputString) {
    let htmlString = inputString;

    const rules = [
        { from: /{b}(.*?){\\\/b}/g, to: '<b>$1</b>' },
        { from: /\{bc}/g, to: '<b>:</b> ' },
        { from: /\{inf}(.*?)\{\\?\/inf}/g, to: '<sub>$1</sub>' },
        { from: /\{it}(.*?)\{\\?\/it}/g, to: '<i>$1</i>' },
        { from: /\{ldquo}/g, to: '\u201C' },
        { from: /\{rdquo}/g, to: '\u201D' },
        { from: /\{sc}(.*?)\{\\?\/sc}/g, to: '<span style="font-variant: small-caps;">$1</span>' },
        { from: /\{sup}(.*?)\{\\?\/sup}/g, to: '<sup>$1</sup>' },
        { from: /\{dx_def}(.*?)\{\\?\/dx_def}/g, to: '<span class="dx_def">$1</span>' },
        { from: /\{gloss}(.*?)\{\\\/gloss}/g, to: '<span class="gloss">$1</span>' },
        { from: /\{parahw}(.*?)\{\\\/qword}/g, to: '<span class="parahw">$1</span>' },
        { from: /\{phrase}(.*?)\{\\\/phrase}/g, to: '<span class="phrase">$1</span>' },
        { from: /\{qword}(.*?)\{\\\/qword}/g, to: '<span class="qword">$1</span>' },
        { from: /\{wi}(.*?)\{\\?\/wi}/g, to: '<span class="wi">$1</span>' },
        { from: /\{(?:sx|[adi]_link|dxt)\|([a-z:1-9]*?)\|?([a-z:1-9]*?)\|?([a-z:1-9]*?)}/g, to: '<a href="https://www.merriam-webster.com/dictionary/$1" target="_blank" style="font-weight: bold">$1</a>' },
    ];

    rules.forEach(rule => {
        htmlString = htmlString.replace(rule.from, rule.to);
    });

    return htmlString;
}

function selectWord(word) {
    const words = document.querySelectorAll(".word-item");
    for (const w of words) {
        if (w.innerText === word) {
            w.click();
            break;
        }
    }
}

async function deleteWord (word) {
    const response = await fetch(url + "/word/" + word, {
        method: 'DELETE',
    });
    if (response.status !== 200) {
        console.error("Failed to delete word", response.status);
    }

    const json = await response.json();
    if (json.message !== "success") {
        console.error("Failed to delete word", json);
        return;
    }

    let wordItem = null;
    document.querySelectorAll(".word-item").forEach(item => {
        if (item.innerText === word) {
            wordItem = item;
        }
    });
    if (!wordItem) {
        console.error("Failed to find word item", word);
        return;
    }
    const nextWord = wordItem.nextSibling;
    wordItem.remove();
    delete AllList[word];
    if (ActiveWordDiv.innerText === word) {
        // select the next
        if (nextWord) {
            nextWord.click();
        }
    }
}

function showDetail(word) {
    console.log("showing detail for " + word);
    const title = document.getElementById("word-title");
    const descriptions = document.getElementById("word-descriptions");

    title.innerText = word;
    const websterIcon = document.getElementById("webster-icon");
    websterIcon.parentNode.href = `https://www.merriam-webster.com/dictionary/${word}`;
    const cambridgeIcon = document.getElementById("cambridge-icon");
    cambridgeIcon.parentNode.href = `https://dictionary.cambridge.org/dictionary/english/${word}`;

    AIFetchController.abort();
    AIFetchController = new AbortController();

    const aiDiv = document.getElementById("word-ai-assistance");
    aiDiv.innerHTML = "Loading...";
    fetch(url + "/ai/" + word, {
        method: "GET",
        headers: {
            what: "HowToUse",
            word: word,
        },
        signal: AIFetchController.signal,
    }).then(response => {
        if (response.status !== 200) {
            console.error("Failed to get word", response.status);
            return;
        }
        response.json().then(json => {
            aiDiv.innerHTML = "";
            let msg = json.message;
            msg = msg.replace(/\n/g, "<br/>");
            msg = msg.replace(/<br\/?> *(?:<br\/?>)*/g, "<br/>");
            msg = msg.replace(/<br\/?> ?<div/g, "<div");
            aiDiv.innerHTML = msg;
        });
    })

    descriptions.innerHTML = "";

    let def = AllList[word].definition;
    if (typeof def === "string") {
        def = JSON.parse(def);
    }
    for (const d of def) {
        const h2 = document.createElement('h2');
        h2.innerText = `[${d.fl}]`;
        descriptions.appendChild(h2);

        if (d.meta && d.meta.stems) {
            const stems = document.createElement('p');
            stems.classList.add("word-stems");
            stems.innerText = d.meta.stems.join("; ");
            descriptions.appendChild(stems);
        }
        if (!d.def) {
            continue;
        }
        for (const df of d.def) {
            for (const sseq of df.sseq) {
                for (const seq of sseq) {
                    if (seq[0] === "sense") {
                        for (const dt of seq[1].dt) {
                            if (dt[0] === "text") {
                                const p = document.createElement('p');
                                p.innerHTML = convertToHTML(dt[1]);
                                descriptions.appendChild(p);
                            }
                            if (dt[0] === "vis") {
                                for (const vis of dt[1]) {
                                    const vs = document.createElement('p');
                                    vs.classList.add("word-vis");
                                    vs.innerHTML = convertToHTML(vis.t);
                                    descriptions.appendChild(vs);
                                }
                            }
                        }
                    }
                    descriptions.appendChild(document.createElement('hr'));
                }
            }
        }
    }

    const deleteButton = document.createElement('button');
    deleteButton.className = "delete-word-button";
    deleteButton.innerHTML = "delete";
    deleteButton.addEventListener('click', async () => {
        await deleteWord(word);
    });
    descriptions.appendChild(deleteButton);
}

function makeWordItem(word) {
    const wordItem = document.createElement('div');
    wordItem.className = "word-item";
    wordItem.innerText = word;
    wordItem.addEventListener('click', (e) => {
        if (ActiveWordDiv) {
            if (ActiveWordDiv === e.target) {
                return;
            }
            ActiveWordDiv.classList.remove("word-item-active");
        }
        e.target.classList.add("word-item-active");
        ActiveWordDiv = e.target;
        showDetail(word);
    });
    return wordItem;
}

async function addWord(word) {
    fetch(url + "/word/" + word, {
        method: "PUT"
    }).then(response => {
        return response.json();
    }).then(json => {
        const result = json.message;
        const resultDiv = document.getElementById("add-word-result");
        if (result === "new") {
            console.log(`new word ${word} added`);
            AllList[word] = json;

            const wordItem = makeWordItem(word);
            const cardListDiv = document.querySelector('.words-list');
            // insert wordItem alphabetically
            const wordItems = cardListDiv.querySelectorAll(".word-item");
            let inserted = false;
            for (let i = 0; i < wordItems.length; i++) {
                if (word.localeCompare(wordItems[i].innerText) < 0) {
                    cardListDiv.insertBefore(wordItem, wordItems[i]);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                cardListDiv.appendChild(wordItem);
            }
            resultDiv.style.color = "green";
            resultDiv.innerText = `${word} added`;
            selectWord(word);
        } else if (result === "duplicate") {
            resultDiv.style.color = "red";
            resultDiv.innerText = `${word} already exists`;
        }
    });
}

document.getElementById("add-word-button").addEventListener('click', async () => {
    const word = document.getElementById("new-word-input").value;
    await addWord(word);
});

document.getElementById("new-word-input").addEventListener('keyup', async (e) => {
    if (e.key === "Enter") {
        const word = document.getElementById("new-word-input").value;
        await addWord(word);
    }
});

fetch(url + "/list").then(response => {
    return response.json();
}).then(json => {
    json.sort((a, b) => {
        return a.word.localeCompare(b.word);
    });
    AllList = {};
    const cardListDiv = document.querySelector('.words-list');
    for (const wo of json) {
        AllList[wo.word] = wo;

        const wordItem = makeWordItem(wo.word);

        cardListDiv.appendChild(wordItem);
    }
    selectWord(json[0].word);
});

