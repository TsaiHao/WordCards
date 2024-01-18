use reqwest;
use rusqlite::{Connection, params, Result};
use serde::{Deserialize, Serialize};
use serde_json;
use std::env;
use std::sync::{Arc, Mutex};
use rusqlite::DropBehavior::Panic;
use tokio;
use warp;
use warp::Filter;

const DICT_URL: &str = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";

#[derive(Deserialize, Serialize, Debug, Clone)]
struct WordDefinition {
    fl: String,
    shortdef: Vec<String>,
}

#[derive(Serialize, Debug)]
struct WordEntry {
    word: String,
    definition: Vec<WordDefinition>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct WordResponse {
    result: String,
    word: Option<String>,
    definition: Option<Vec<WordDefinition>>,
    message: Option<String>,
    suggestions: Option<Vec<String>>,
}

fn main() {
    let dict_key = env::var("DICT_KEY").expect("DICT_KEY not found in environment");

    let database = Connection::open("../../words.db").expect("Failed to open database");
    database.execute(
        "CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT, date TEXT)",
        [],
    )
        .expect("Failed to create table");

    let database = Arc::new(Mutex::new(database));

    let database_list = database.clone();
    let list_route = warp::path!("api" / "list").map(move || {
        let database_list = database_list.lock().unwrap();
        let res = list_all_words(&database_list);
        warp::reply::json(&res)
    });

    let database_query = database.clone();
    let query_route = warp::path!("api" / "word" / String).map(move |word: String| {
        let db = database_query.lock().expect("get database failed when querying");
        let res = query_word(&db, word);
        match res {
            Some(def) => warp::reply::json(&def),
            None => panic!(),
        }
    });

    let routes = list_route.or(query_route);

    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        warp::serve(routes).run(([127, 0, 0, 1], 12300)).await;
    });
}

fn list_all_words(db: &Connection) -> Vec<String> {
    let list = db.prepare("SELECT word FROM words");
    match list {
        Ok(mut stat) => {
            let iter = stat.query_map([], |row| {
                let word: String = row.get(0).expect("get 0 failed");
                Ok(word)
            }).expect("query map failed");

            let mut words = Vec::new();
            for word_result in iter {
                if let Ok(word) = word_result {
                    words.push(word);
                }
            }

            words
        },
        Err(e) => {
            panic!("")
        }
    }
}

fn query_word(db: &Connection, word: String) -> Option<String> {
    let mut stmt = db.prepare("SELECT definition FROM words where word = ?1")
        .expect("prepare db failed");
    let mut row = stmt.query_row(params![word], |row| row.get(0));

    match row {
        Ok(def) => {
            def
        },
        Err(e) => {
            panic!("");
        }
    }
}
