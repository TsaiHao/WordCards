use reqwest;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json;
use std::env;
use std::sync::{Arc, Mutex};
use warp;
use warp::Filter;
use tokio;

const DICT_URL: &str = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";

#[derive(Deserialize, Serialize, Debug, Clone)]
struct WordObject {
    fl: String,
    shortdef: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
struct WordResponse {
    word: Option<String>,
    definition: Option<WordObject>,
    result: String,
    suggestions: Option<Vec<String>>,
}

fn main() {
    let dict_key = env::var("DICT_KEY").expect("DICT_KEY not found in environment");

    let conn = Connection::open("./words.db").expect("Failed to open database");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT)",
        [],
    )
    .expect("Failed to create table");
    let conn = Arc::new(Mutex::new(conn));

    let conn_word = conn.clone();
    let word_route = warp::path!("word" / String).map(move |word: String| {
        let dict_key = dict_key.clone();
        let word = word.clone();

        let conn_lock = conn_word.lock().unwrap();
        warp::reply::json(&get_word(&conn_lock, &word, &dict_key))
    });

    let conn_list = conn.clone();
    let list_route = warp::path!("list").map(move || {
        let conn_lock = conn_list.lock().unwrap();

        let res = list_all_words(&conn_lock);

        warp::reply::json(&res)
    });

    let static_route = warp::path("static").and(warp::fs::dir("../../public"));

    let routes = static_route.or(word_route.or(list_route));

    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        warp::serve(routes).run(([127, 0, 0, 1], 12300)).await;
    });
}

fn get_word(conn: &Connection, word: &str, dict_key: &str) -> WordResponse {
    let row = conn.query_row("SELECT * FROM words WHERE word = ?", &[word], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    });

    match row {
        Ok((_, _definition)) => WordResponse {
            word: Some(word.to_string()),
            definition: None,
            result: "duplicate".to_string(),
            suggestions: None,
        },
        Err(_) => {
            let full_url = format!("{}{}?key={}", DICT_URL, word, dict_key);
            let res: Result<Vec<WordObject>, _> =
                reqwest::blocking::get(&full_url).and_then(|res| res.json());

            match res {
                Ok(data) => {
                    conn.execute(
                        "INSERT INTO words (word, definition) VALUES (?, ?)",
                        &[word, &serde_json::to_string(&data).unwrap()],
                    )
                    .unwrap();

                    WordResponse {
                        word: Some(word.to_string()),
                        definition: Some(data[0].clone()),
                        result: "new".to_string(),
                        suggestions: None,
                    }
                }
                Err(_) => {
                    let suggestion: Vec<String> = reqwest::blocking::get(&full_url)
                        .and_then(|res| res.json())
                        .unwrap();
                    WordResponse {
                        word: None,
                        definition: None,
                        result: "spell_check".to_string(),
                        suggestions: Some(suggestion),
                    }
                }
            }
        }
    }
}

fn list_all_words(conn: &Connection) -> Vec<(String, WordObject)> {
    conn.prepare("SELECT * FROM words")
        .unwrap()
        .query_map([], |row| {
            let word: String = row.get(0)?;
            let definition: String = row.get(1)?;
            Ok((word, serde_json::from_str(&definition).unwrap()))
        })
        .unwrap()
        .map(|row| row.unwrap())
        .collect()
}
