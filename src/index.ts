import fetch from 'node-fetch';
import sqlite3 from "sqlite3";
import {open, Database} from "sqlite";
import express from 'express';
import cors from 'cors';

const url = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";

let recycleBinDB: Database | undefined = undefined;

interface WordObject {
    fl: string;
    shortdef: string[];
}

interface WordResponse {
    word: string;
    definition: WordObject[];
    message: string;
}

interface DatabaseItem {
    word: string;
    definition: string;
    date: string;
}

async function openDB() {
    const db = await open({
        filename: "./words.db",
        driver: sqlite3.Database,
    });
    await db.run("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT, date TEXT)");

    recycleBinDB = await open({
        filename: "./history.db",
        driver: sqlite3.Database,
    });
    await recycleBinDB.run("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT, date TEXT)");

    return db;
}

async function saveWord(db: Database, word: string, definition: string) {
    await db.run("INSERT INTO words (word, definition, date) VALUES (?, ?, ?)", [word, definition, new Date().toISOString()]);
}

async function getWord(db: Database, word: string): Promise<DatabaseItem | undefined> {
    return await db.get("SELECT * FROM words WHERE word = ?", [word]);
}

async function removeWord(db: Database, word: string) {
    const existingWord = await getWord(db, word);
    if (existingWord) {
        await recycleBinDB?.run("INSERT INTO words (word, definition, date) VALUES (?, ?, ?)", [word, existingWord.definition, new Date().toISOString()]);
        await db.run("DELETE FROM words WHERE word = ?", [word]);
    }
}

async function listAllWords(db: Database): Promise<DatabaseItem[]> {
    return await db.all("SELECT * FROM words");
}

async function main() {
    if (!process.env["DICT_KEY"]) {
        console.log("Please set the environment variable DICT_KEY");
        process.exit(1);
    }

    const db = await openDB();

    let app = express();
    app.use(cors());

    app.get("/api/word/:word", (req, res) => {
        const word = req.params.word.toLowerCase();
        console.log("querying word: " + word);

        getWord(db, word).then((item) => {
            if (item) {
                res.status(200).json(
                    item
                );
            } else {
                res.status(404).json({
                    "message": "not_found",
                });
            }
        });
    });

    app.get("/api/list", (req, res) => {
        listAllWords(db).then((words) => {
            console.log(`Requesting word list from ip ${req.ip}`)
            const items = words.map((row) => {
                return row.word;
            });
            res.status(200).json(items);
        });
    });

    app.put("/api/word/:word", (req, res) => {
        const word = req.params.word.toLowerCase();
        console.log(`Adding word [${word}] from ip ${req.ip}`);

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

    app.delete("/api/word/:word", (req, res) => {
        const word = req.params.word.toLowerCase();
        try {
            console.log(`Deleting word [${word}] from ip ${req.ip}`);

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
    //app.use(express.static('ui_html'));

    const port = 5678;
    app.listen(port, () => {
        console.log(`Server started on port ${port}`);
    });
}

main().catch(err => {
    console.log("Error: " + err);
    process.exit(1);
});
