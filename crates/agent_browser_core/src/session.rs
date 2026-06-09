use std::fmt::{Display, Formatter};

use crate::document::{Document, Snapshot};
use crate::{html, net};

#[derive(Debug)]
pub enum BrowserError {
    Fetch(net::FetchError),
    NoDocumentOpen,
    LinkNotFound(usize),
    CannotGoBack,
    CannotGoForward,
}

impl Display for BrowserError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Fetch(error) => write!(f, "{error}"),
            Self::NoDocumentOpen => write!(f, "no document is open"),
            Self::LinkNotFound(id) => write!(f, "link not found: {id}"),
            Self::CannotGoBack => write!(f, "cannot go back"),
            Self::CannotGoForward => write!(f, "cannot go forward"),
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
    current_index: Option<usize>,
}

impl BrowserSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&mut self, url: &str) -> Result<Snapshot, BrowserError> {
        let doc = load_document(url)?;
        if let Some(index) = self.current_index {
            self.history.truncate(index + 1);
        }
        self.history.push(url.to_string());
        self.current_index = Some(self.history.len() - 1);
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

    pub fn back(&mut self) -> Result<Snapshot, BrowserError> {
        let index = self.current_index.ok_or(BrowserError::NoDocumentOpen)?;
        if index == 0 {
            return Err(BrowserError::CannotGoBack);
        }

        self.navigate_to_history_index(index - 1)
    }

    pub fn forward(&mut self) -> Result<Snapshot, BrowserError> {
        let index = self.current_index.ok_or(BrowserError::NoDocumentOpen)?;
        if index + 1 >= self.history.len() {
            return Err(BrowserError::CannotGoForward);
        }

        self.navigate_to_history_index(index + 1)
    }

    pub fn reload(&mut self) -> Result<Snapshot, BrowserError> {
        let index = self.current_index.ok_or(BrowserError::NoDocumentOpen)?;
        self.navigate_to_history_index(index)
    }

    pub fn history(&self) -> &[String] {
        &self.history
    }

    fn navigate_to_history_index(&mut self, index: usize) -> Result<Snapshot, BrowserError> {
        let url = self.history[index].clone();
        let doc = load_document(&url)?;
        self.current_index = Some(index);
        let snapshot = doc.snapshot();
        self.current = Some(doc);
        Ok(snapshot)
    }
}

fn load_document(url: &str) -> Result<Document, BrowserError> {
    let body = net::fetch(url)?;
    Ok(html::parse_document(url, &body))
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

    #[test]
    fn back_forward_reload_and_history_truncation_are_consistent() {
        let root = env!("CARGO_MANIFEST_DIR");
        let first_url = format!("{root}/../../fixtures/example.html");
        let second_url = format!("{root}/../../fixtures/docs.html");
        let mut session = BrowserSession::new();

        session.open(&first_url).expect("first fixture should open");
        session
            .open(&second_url)
            .expect("second fixture should open");

        let back = session.back().expect("back should navigate");
        assert_eq!(back.title.as_deref(), Some("Agent Browser Fixture"));

        let forward = session.forward().expect("forward should navigate");
        assert_eq!(forward.title.as_deref(), Some("Agent Browser Docs"));

        let reload = session.reload().expect("reload should keep current page");
        assert_eq!(reload.title.as_deref(), Some("Agent Browser Docs"));
        assert_eq!(session.history().len(), 2);

        session.back().expect("back should navigate again");
        let new_branch = session.open(&second_url).expect("new branch should open");
        assert_eq!(new_branch.title.as_deref(), Some("Agent Browser Docs"));
        assert_eq!(session.history().len(), 2);
    }
}
