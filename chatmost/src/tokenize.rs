use std::collections::HashSet;

pub const STOPWORDS: &[&str] = &[
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of", "in", "on",
    "at", "by", "with", "without", "about", "against", "between", "into", "through", "during",
    "before", "after", "above", "below", "from", "up", "down", "out", "off", "over", "under",
    "again", "further", "once", "here", "there", "when", "where", "why", "how", "all", "any",
    "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only",
    "own", "same", "so", "than", "too", "very", "just", "now", "you", "your", "yours", "it",
    "its", "this", "that", "these", "those", "i", "me", "my", "mine", "we", "us", "our", "ours",
    "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers", "be", "been",
    "being", "am", "is", "are", "was", "were", "do", "does", "did", "doing", "have", "has",
    "had", "having", "will", "would", "shall", "should", "can", "could", "may", "might",
];

pub const BOT_LOGINS: &[&str] = &[
    "streamelements",
    "streamlabs",
    "nightbot",
    "moobot",
    "fossabot",
    "wizebot",
    "trollbot",
    "electroblobbot",
    "soundalerts",
    "pronterplay",
    "phantombot",
    "botrix",
    "streamerbot",
];

pub struct Tokenizer {
    stopwords: HashSet<String>,
}

impl Tokenizer {
    pub fn new() -> Self {
        Self {
            stopwords: STOPWORDS.iter().map(|s| s.to_string()).collect(),
        }
    }

    /// Split a chat message into word tokens, lowercased and cleaned.
    pub fn words(&self, text: &str) -> Vec<String> {
        let mut out = Vec::new();
        for piece in text.split_whitespace() {
            let cleaned: String = piece
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '\'')
                .collect();
            let lower = cleaned.to_lowercase();
            if lower.len() < 3 {
                continue;
            }
            if self.stopwords.contains(&lower) {
                continue;
            }
            // skip obvious links / tokens with mixed number patterns already handled
            if lower.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            out.push(lower);
        }
        out
    }
}

/// True if the user login should be excluded from leaderboards.
pub fn is_bot(login: &str) -> bool {
    BOT_LOGINS.contains(&login.to_lowercase().as_str())
}

pub fn is_command(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with('!')
}