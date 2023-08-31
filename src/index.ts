import fetch from 'node-fetch';
import sqlite3 from "sqlite3";
import {open, Database} from "sqlite";
import express from 'express';

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
                res.json({
                    "result": "duplicate",
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
                            res.json({
                                "result": "new",
                                "word": word,
                                "definition": json as WordObject[],
                            });
                            console.log("saving word: " + word);
                            saveWord(db, word, JSON.stringify(json));
                        } else {
                            res.json({
                                "result": "spell_check",
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

    app.get("/list", (req, res) => {
        listAllWords(db).then((words) => {
            res.json(words);
        });
    });

    app.delete("/word/:word", (req, res) => {
        const word = req.params.word;
        try {
            removeWord(db, word).then(() => {
                console.log("deleted word: " + word);
                res.json({
                    "result": "success",
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
}

main().catch(err => {
    console.log("Error: " + err);
    process.exit(1);
});
