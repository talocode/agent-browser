use std::fmt::{Display, Formatter};

use crate::document::{Document, Snapshot};
use crate::{html, net};

#[derive(Debug)]
pub enum BrowserError {
    Fetch(net::FetchError),
    NoDocumentOpen,
    LinkNotFound(usize),
}

impl Display for BrowserError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Fetch(error) => write!(f, "{error}"),
            Self::NoDocumentOpen => write!(f, "no document is open"),
            Self::LinkNotFound(id) => write!(f, "link not found: {id}"),
        }
    }
}

impl std::error::Error for BrowserError {}

impl From<net::FetchError> for BrowserError {
    fn from(value: net::FetchError) -> Self {
        Self::Fetch(value)
    }
}

#[derive(Debug, Default)]
pub struct BrowserSession {
    current: Option<Document>,
    history: Vec<String>,
}

impl BrowserSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&mut self, url: &str) -> Result<Snapshot, BrowserError> {
        let body = net::fetch(url)?;
        let doc = html::parse_document(url, &body);
        self.history.push(url.to_string());
        let snapshot = doc.snapshot();
        self.current = Some(doc);
        Ok(snapshot)
    }

    pub fn click(&mut self, link_id: usize) -> Result<Snapshot, BrowserError> {
        let current = self.current.as_ref().ok_or(BrowserError::NoDocumentOpen)?;
        let link = current
            .links
            .iter()
            .find(|link| link.id == link_id)
            .ok_or(BrowserError::LinkNotFound(link_id))?;
        let href = link.href.clone();
        self.open(&href)
    }

    pub fn snapshot(&self) -> Result<Snapshot, BrowserError> {
        self.current
            .as_ref()
            .map(Document::snapshot)
            .ok_or(BrowserError::NoDocumentOpen)
    }

    pub fn history(&self) -> &[String] {
        &self.history
    }
}

#[cfg(test)]
mod tests {
    use super::BrowserSession;

    #[test]
    fn open_snapshot_click_and_history_are_consistent() {
        let root = env!("CARGO_MANIFEST_DIR");
        let fixture = format!("{root}/../../fixtures/example.html");
        let mut session = BrowserSession::new();

        let first = session.open(&fixture).expect("fixture should open");
        assert_eq!(first.title.as_deref(), Some("Agent Browser Fixture"));
        assert_eq!(first.links[0].text, "Read the docs");

        let snapshot = session.snapshot().expect("snapshot should be available");
        assert_eq!(snapshot.url, first.url);

        let second = session.click(0).expect("link should navigate");
        assert_eq!(second.title.as_deref(), Some("Agent Browser Docs"));
        assert_eq!(session.history().len(), 2);
        assert_eq!(session.history()[0], fixture);
        assert_eq!(session.history()[1].as_str(), first.links[0].href.as_str());
    }
}
