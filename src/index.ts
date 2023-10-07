import fetch from 'node-fetch';
import sqlite3 from "sqlite3";
import {open, Database} from "sqlite";
import express from 'express';
import OpenAI from 'OpenAI';

const url = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";

async function openDB() {
    const db = await open({
        filename: "./words.db",
        driver: sqlite3.Database,
    });
    await db.run("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT)");
    return db;
}

async function saveWord(db: Database, word: string, definition: string) {
    await db.run("INSERT INTO words (word, definition) VALUES (?, ?)", [word, definition]);
}

async function getWord(db: Database, word: string) {
    return await db.get("SELECT * FROM words WHERE word = ?", [word]);
}

async function removeWord(db: Database, word: string) {
    await db.run("DELETE FROM words WHERE word = ?", [word]);
}

async function listAllWords(db: Database): Promise<string[]> {
    return await db.all("SELECT * FROM words");
}

interface WordObject {
    fl: string;
    shortdef: string[];
}

interface WordResponse {
    word: string;
    definition: WordObject[];
    message: string;
}

enum AIType {
    HowToUse,
}

async function ai(word: string, type: AIType): Promise<string> {
    if (!process.env["OPENAI_KEY"]) {
        throw new Error("Please set the environment variable OPENAI_KEY");
    }
    const aiKey = process.env["OPENAI_KEY"];

    let url = "https://api.openai.com/v1/engines/davinci/completions";
    if (process.env["OPENAI_URL"]) {
        console.log("using ai url " + process.env["OPENAI_URL"]);
        url = process.env["OPENAI_URL"] + "";
    }

    try {
        const openai = new OpenAI({
            apiKey: aiKey,
            baseURL: url,
        });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    "role": "user",
                    "content": "How to use the word " + word + "?",
                }
            ]
        });

        return completion.choices[0].message.content ?? "Error response";
    } catch (err) {
        console.log("Error: " + err);
        return "Error: " + err;
    }
}
async function main() {
    if (!process.env["DICT_KEY"]) {
        console.log("Please set the environment variable DICT_KEY");
        process.exit(1);
    }

    const db = await openDB();

    let app = express();
    app.get("/word/:word", (req, res) => {
        const word = req.params.word;
        console.log("querying word: " + word);

        getWord(db, word).then((row) => {
            if (row) {
                res.status(200).json(
                    row
                );
            }
        });
    });

    app.get("/list", (req, res) => {
        listAllWords(db).then((words) => {
            res.status(200).json(words);
        });
    });

    app.put("/word/:word", (req, res) => {
        const word = req.params.word;
        console.log("adding word: " + word);

        getWord(db, word).then((row) => {
            if (row) {
                res.status(409).json({
                    message: "duplicate",
                });
            } else {
                const fullUrl = url + word + "?key=" + process.env["DICT_KEY"];
                fetch(fullUrl).then(response => response.json())
                    .then((json) => {
                        type FetchedData = WordObject[] | string[];
                        function isWordObjectArray(data: FetchedData): data is WordObject[] {
                            return (data as WordObject[])[0].fl !== undefined;
                        }
                        if (isWordObjectArray(json as FetchedData)) {
                            res.status(200).json({
                                "word": word,
                                "definition": json as WordObject[],
                                "message": "new",
                            });
                            console.log("saving word: " + word);
                            saveWord(db, word, JSON.stringify(json));
                        } else {
                            res.status(404).json({
                                "message": "spell_check",
                                "suggestions": json
                            });
                        }
                    })
                    .catch(err => {
                        res.status(500).send("Error fetching word: " + err);
                    });
            }
        });
    });

    app.delete("/word/:word", (req, res) => {
        const word = req.params.word;
        try {
            removeWord(db, word).then(() => {
                console.log("deleted word: " + word);
                res.json({
                    "message": "success",
                });
            });
        } catch (err) {
            res.status(500).send("Error deleting word: " + err);
        }
    });
    app.use(express.static('public'));

    app.listen(12300, () => {
        console.log("Server started on port 12300");
    });

    app.get("/ai/:word", (req, res) => {
        const headers = req.headers;
        const word = req.params.word;
        const what = headers.what;

        const aiType = AIType[what as keyof typeof AIType];
        if (aiType === undefined) {
            console.error("Invalid AI type: " + what);
            res.status(400).send("Invalid AI type");
        }

        console.log("requesting ai with word: " + word + " and type: " + what);
        ai(word, aiType).then((response) => {
            res.status(200).json({
                "message": response,
            })
        });
    });
}

main().catch(err => {
    console.log("Error: " + err);
    process.exit(1);
});
