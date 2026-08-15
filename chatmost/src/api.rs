use anyhow::{Context, Result};
use serde::Deserialize;
use std::time::Duration;

pub const DEFAULT_BASE: &str = "https://logs.zonian.dev";

pub struct Client {
    http: reqwest::blocking::Client,
    base: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Day {
    pub year: String,
    pub month: String,
    pub day: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LogsResponse {
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    pub text: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub user_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub timestamp: String,
    #[serde(default)]
    pub tags: Tags,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Tags {
    #[serde(default)]
    pub emotes: String,
}

impl Client {
    pub fn new(base: Option<&str>) -> Result<Self> {
        let http = reqwest::blocking::Client::builder()
            .user_agent("chatmost/0.1 (jo2uke chat game)")
            .timeout(Duration::from_secs(60))
            .build()
            .context("build http client")?;
        Ok(Self {
            http,
            base: base.unwrap_or(DEFAULT_BASE).trim_end_matches('/').to_string(),
        })
    }

    fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<Option<T>> {
        let url = format!("{}{}", self.base, path);
        let mut attempt = 0usize;
        let resp = loop {
            let result = self.http.get(&url).send();
            match result {
                Ok(r) if r.status().as_u16() == 429 || r.status().is_server_error() => {
                    attempt += 1;
                    if attempt > 6 {
                        anyhow::bail!("GET {url} kept failing with HTTP {}", r.status());
                    }
                    eprintln!("rate-limited (HTTP {}) on {url}; backing off", r.status());
                    std::thread::sleep(std::time::Duration::from_millis(1000u64 * attempt as u64));
                }
                Ok(r) => break r,
                Err(e) => {
                    attempt += 1;
                    if attempt > 6 {
                        return Err(e).with_context(|| format!("GET {url}"));
                    }
                    eprintln!("request error on {url}: {e}; retrying");
                    std::thread::sleep(std::time::Duration::from_millis(1000u64 * attempt as u64));
                }
            }
        };
        let status = resp.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            let body = resp.text().unwrap_or_default();
            anyhow::bail!("GET {url} -> HTTP {status}: {}", body.chars().take(300).collect::<String>());
        }
        let body = resp.bytes().context("read response body")?;
        let parsed = serde_json::from_slice(&body).with_context(|| format!("parse JSON from {url}"))?;
        Ok(Some(parsed))
    }

    pub fn list_days(&self, channel: &str) -> Result<Vec<Day>> {
        #[derive(Deserialize)]
        struct ListResp {
            #[serde(rename = "availableLogs", alias = "available_logs")]
            available_logs: Vec<Day>,
        }
        let path = format!("/list?channel={channel}");
        let resp = self.get_json::<ListResp>(&path)?.unwrap_or(ListResp { available_logs: Vec::new() });
        Ok(resp.available_logs)
    }

    /// Fetch a full day of chat, paginating with offset until exhaustion.
    /// A 404 at a later offset simply means there are no more messages.
    pub fn fetch_day(&self, channel: &str, day: &Day) -> Result<Vec<Message>> {
        const LIMIT: usize = 1000;
        let mut out = Vec::new();
        let mut offset = 0usize;
        loop {
            let path = format!(
                "/channel/{channel}/{}/{}/{}?limit={LIMIT}&offset={offset}&json",
                day.year, day.month, day.day
            );
            match self.get_json::<LogsResponse>(&path)? {
                Some(page) => {
                    let n = page.messages.len();
                    out.extend(page.messages);
                    if n < LIMIT {
                        break;
                    }
                    offset += n;
                }
                None => break,
            }
        }
        Ok(out)
    }
}
