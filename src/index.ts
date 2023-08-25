import readline from 'readline';
import fetch from 'node-fetch';
import chalk from 'chalk';
import sqlite3 from "sqlite3";
import {open, Database} from "sqlite";
import stream from 'stream';

const url = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";

async function openDB() {
    return open({
        filename: "./words.db",
        driver: sqlite3.Database
    }).then(async (db) => {
        await db.run("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT)");
        return db;
    })
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

async function listAllWords(db: Database) {
    const rows = await db.all("SELECT * FROM words");
    for (const row of rows) {
        console.log(chalk.blue(row.word));
    }
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
    const output = new stream.Writable({
        write(chunk, encoding, callback) {
            callback();
        }
    });
    const rl = readline.createInterface({
        input: process.stdin,
        output: output,
    });

    const db = await openDB();

    const displayWord = (headWord: string, wordJson: WordObject[]) => {
        for (const word of wordJson) {
            console.log(`${headWord}: [${word.fl}]`);
            for (const def of word.shortdef) {
                console.log(`  ${def}`);
            }
        }
    };

    const processCommand = async (cmd: string) => {
        if (cmd.startsWith('/')) {
            cmd = cmd.substring(1);
        }
        if (cmd === 'exit') {
            rl.close();
            process.exit(0);
        } else if (cmd.startsWith('remove ')) {
            const word = cmd.substring(7).trim();
            await removeWord(db, word);
            console.log(`Removed ${word}`);
        } else if (cmd.startsWith('list')) {
            await listAllWords(db)
            console.log(`Listed all words`);
        }
    }

    const processWord = (word: string) => {
        getWord(db, word).then((row) => {
            if (row) {
                displayWord(word, JSON.parse(row.definition));
                loop();
            } else {
                const fullUrl = url + word + "?key=" + process.env["DICT_KEY"];
                fetch(fullUrl).then(response => response.json())
                    .then((json) => {
                        type FetchedData = WordObject[] | string[];
                        function isWordObjectArray(data: FetchedData): data is WordObject[] {
                            return (data as WordObject[])[0].fl !== undefined;
                        }
                        if (isWordObjectArray(json as FetchedData)) {
                            displayWord(word, json as WordObject[]);
                            saveWord(db, word, JSON.stringify(json));
                        } else {
                            console.log("input word is not available, check the following: ");
                            for (const word of json as string[]) {
                                console.log(`  ${word}`);
                            }
                        }
                        loop();
                    })
                    .catch(err => {
                        console.log("Error fetching word: " + err);
                        loop();
                    });
            }
        });
    }

    function loop() {
        console.log("please input a word or command")
        rl.question("", (word) => {
            word = word.trim();
            if (word.startsWith('/')) {
                processCommand(word).then(() => loop()).catch(err => {
                    console.log("Error: " + err);
                    loop();
                });
            } else {
                processWord(word);
            }
        });
    }

    loop();
}

main().catch(err => {
    console.log("Error: " + err);
    process.exit(1);
});
