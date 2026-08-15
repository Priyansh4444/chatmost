use anyhow::Result;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Deserialize)]
struct SevenTvUser {
    emote_set: SevenTvEmoteSet,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmoteSet {
    #[serde(default)]
    emotes: Vec<SevenTvEmote>,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmote {
    name: String,
    #[serde(default)]
    data: Option<SevenTvEmoteData>,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmoteData {
    id: String,
}

impl SevenTvEmote {
    fn data_id(&self) -> String {
        self.data.as_ref().map(|d| d.id.clone()).unwrap_or_default()
    }
}

#[derive(Debug, Deserialize)]
struct SevenTvGlobalSet {
    #[serde(default)]
    emotes: Vec<SevenTvEmote>,
}

/// Names of 7TV emotes available in the channel's set plus the global set.
pub struct SevenTv {
    pub channel: HashSet<String>,
    pub global: HashSet<String>,
    /// name -> emote id (channel set only), for building image URLs.
    pub ids: HashMap<String, String>,
}

impl SevenTv {
    pub fn load(channel_twitch_id: &str) -> Result<Self> {
        let http = reqwest::blocking::Client::new();
        let mut channel = HashSet::new();
        let mut ids = HashMap::new();
        let url = format!("https://7tv.io/v3/users/twitch/{channel_twitch_id}");
        if let Ok(resp) = http.get(&url).send() {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<SevenTvUser>() {
                    for e in &body.emote_set.emotes {
                        channel.insert(e.name.clone());
                        ids.insert(e.name.clone(), e.data_id());
                    }
                }
            }
        }
        let mut global = HashSet::new();
        if let Ok(resp) = http.get("https://7tv.io/v3/emote-sets/global").send() {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<SevenTvGlobalSet>() {
                    global.extend(body.emotes.iter().map(|e| e.name.clone()));
                }
            }
        }
        Ok(Self { channel, global, ids })
    }

    pub fn is_emote(&self, token: &str) -> bool {
        self.channel.contains(token) || self.global.contains(token)
    }
}

/// Extract the chat payload from a raw IRC line. Twitch lines look like
/// `@tags :nick!user@host PRIVMSG #channel :the actual message`. System
/// notices use `USERNOTICE #channel :...`. In both cases the payload follows
/// the channel (`#...`) and its trailing ` :`. `/me` actions are wrapped as
/// `\x01ACTION ...\x01`, and Twitch's emote offsets count the 8-character
/// `\x01ACTION ` prefix, so we need to shift positions by 8.
fn irc_message_payload(raw: &str) -> (String, usize) {
    let Some(hash) = raw.find(" #") else {
        return (raw.to_string(), 0);
    };
    let rest = &raw[hash..];
    let Some(colon) = rest.find(" :") else {
        return (raw.to_string(), 0);
    };
    let msg = rest[colon + 2..].to_string();
    let shift = if msg.starts_with("\u{01}ACTION ") { 8 } else { 0 };
    (msg, shift)
}

/// Parse the IRC `emotes` tag (e.g. `25:0-4,6-10/emotesv2_x:12-17`) into the
/// emote names by reading the substrings they occupy in the raw IRC message.
#[allow(dead_code)]
pub fn twitch_emote_names(raw: &str, emotes_tag: &str) -> Vec<String> {
    twitch_emotes_with_ids(raw, emotes_tag)
        .into_iter()
        .map(|(name, _)| name)
        .collect()
}

/// Like [`twitch_emote_names`] but also returns the emote ID so image URLs can
/// be built for the web app.
pub fn twitch_emotes_with_ids(raw: &str, emotes_tag: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if emotes_tag.trim().is_empty() {
        return out;
    }
    let (text, shift) = irc_message_payload(raw);
    // Twitch reports emote offsets in characters, not bytes; messages can
    // contain multi-byte UTF-8 (e.g. curly apostrophes), so slice by chars.
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    for group in emotes_tag.split('/') {
        let Some((emote_id, positions)) = group.split_once(':') else {
            continue;
        };
        for range in positions.split(',') {
            let Some((start, end)) = range.split_once('-') else {
                continue;
            };
            let (Ok(mut start), Ok(mut end)) = (start.parse::<usize>(), end.parse::<usize>()) else {
                continue;
            };
            start += shift;
            end += shift;
            if start > end || end >= n {
                continue;
            }
            let name: String = chars[start..=end].iter().collect();
            out.push((name, emote_id.to_string()));
        }
    }
    out
}

pub fn twitch_emote_url(emote_id: &str) -> String {
    format!("https://static-cdn.jtvnw.net/emoticons/v2/{emote_id}/default/dark/1.0")
}

pub fn seven_tv_emote_url(emote_id: &str) -> String {
    format!("https://cdn.7tv.app/emote/{emote_id}/1x.webp")
}