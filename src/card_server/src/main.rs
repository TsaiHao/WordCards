use reqwest;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json;
use std::env;
use std::sync::{Arc, Mutex};
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

    let conn = Connection::open("../../words.db").expect("Failed to open database");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, definition TEXT)",
        [],
    )
        .expect("Failed to create table");
    let conn = Arc::new(Mutex::new(conn));

    let conn_word = conn.clone();
    let dict_key_clone = dict_key.clone();
    let word_route = warp::path!("word" / String)
        .and_then(move |word: String| {
            let conn = conn_word.clone();
            let dict_key = dict_key_clone.clone();
            async move {
                let response = {
                    let conn_lock = conn.lock().unwrap();
                    // Clone data or perform all database operations here.
                    get_word(&conn_lock, &word, &dict_key).await
                };
                Ok(warp::reply::json(&response))
            }
        });

    let conn_list = conn.clone();
    let list_route = warp::path!("list").map(move || {
        let conn_lock = conn_list.lock().unwrap();

        let res = list_all_words(&conn_lock);

        warp::reply::json(&res)
    });

    let assets_route = warp::path("static").and(warp::fs::dir("../../public/static"));
    let index_route = warp::path::end().and(warp::fs::file("../../public/index.html"));

    let routes = index_route
        .or(assets_route)
        .or(word_route)
        .or(list_route);

    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        warp::serve(routes).run(([127, 0, 0, 1], 12300)).await;
    });
}

async fn get_word(conn: &Connection, word: &str, dict_key: &str) -> WordResponse {
    print!("received word: {}", word);

    let row = conn.query_row("SELECT * FROM words WHERE word = ?", &[word], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    });

    match row {
        Ok((_, _definition)) => WordResponse {
            result: "duplicate".to_string(),
            word: Some(word.to_string()),
            definition: None,
            message: None,
            suggestions: None,
        },
        Err(_) => {
            let full_url = format!("{}{}?key={}", DICT_URL, word, dict_key);
            let res: Result<Vec<WordDefinition>, _> =
                reqwest::get(&full_url).await.unwrap().json().await;

            match res {
                Ok(data) => {
                    conn.execute(
                        "INSERT INTO words (word, definition) VALUES (?, ?)",
                        &[word, &serde_json::to_string(&data).unwrap()],
                    )
                        .unwrap();

                    WordResponse {
                        word: Some(word.to_string()),
                        definition: Some(data),
                        result: "new".to_string(),
                        suggestions: None,
                        message: None,
                    }
                }
                Err(_) => {
                    let suggestion: Vec<String> = reqwest::get(&full_url).await.unwrap().json().await.unwrap();

                    WordResponse {
                        word: None,
                        definition: None,
                        result: "spell_check".to_string(),
                        suggestions: Some(suggestion),
                        message: None,
                    }
                }
            }
        }
    }
}

fn list_all_words(conn: &Connection) -> Vec<WordEntry> {
    conn.prepare("SELECT * FROM words")
        .unwrap()
        .query_map([], |row| {
            let word: String = row.get(0)?;
            let definition: String = row.get(1)?;
            println!("word: {}, def: {}", word, definition);
            Ok(WordEntry {
                word,
                definition: serde_json::from_str(&definition).unwrap(),
            })
        })
        .unwrap()
        .map(|row| row.unwrap())
        .collect()
}
