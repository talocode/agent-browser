use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Link {
    pub id: usize,
    pub text: String,
    pub href: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub url: String,
    pub title: Option<String>,
    pub text: String,
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Snapshot {
    pub url: String,
    pub title: Option<String>,
    pub text: String,
    pub links: Vec<Link>,
}

impl Document {
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            url: self.url.clone(),
            title: self.title.clone(),
            text: self.text.clone(),
            links: self.links.clone(),
        }
    }
}
