use crate::document::{Document, Link};

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    StartTag {
        name: String,
        attrs: Vec<(String, String)>,
    },
    EndTag {
        name: String,
    },
    Text(String),
}

pub fn parse_document(url: &str, html: &str) -> Document {
    let tokens = tokenize(html);
    let mut title = None;
    let mut text = String::new();
    let mut links = Vec::new();
    let mut in_title = false;
    let mut current_link: Option<(String, String)> = None;
    let mut ignored_depth = 0usize;

    for token in tokens {
        match token {
            Token::StartTag { name, attrs } => match name.as_str() {
                "script" | "style" | "noscript" => ignored_depth += 1,
                "title" => in_title = true,
                "a" if ignored_depth == 0 => {
                    if let Some(href) = attr(&attrs, "href") {
                        current_link = Some((href.to_string(), String::new()));
                    }
                }
                "br" | "p" | "div" | "section" | "article" | "li" | "tr" | "h1" | "h2" | "h3"
                    if ignored_depth == 0 =>
                {
                    push_space(&mut text);
                    if let Some((_, label)) = current_link.as_mut() {
                        push_space(label);
                    }
                }
                _ => {}
            },
            Token::EndTag { name } => match name.as_str() {
                "script" | "style" | "noscript" => ignored_depth = ignored_depth.saturating_sub(1),
                "title" => in_title = false,
                "a" if ignored_depth == 0 => {
                    if let Some((href, label)) = current_link.take() {
                        let label = normalize_whitespace(&label);
                        links.push(Link {
                            id: links.len(),
                            text: if label.is_empty() {
                                href.clone()
                            } else {
                                label
                            },
                            href: resolve_url(url, &href),
                        });
                    }
                }
                _ => {}
            },
            Token::Text(raw) if ignored_depth == 0 => {
                let decoded = decode_entities(&raw);
                if in_title {
                    let next_title = title.get_or_insert_with(String::new);
                    next_title.push_str(&decoded);
                } else {
                    append_text(&mut text, &decoded);
                    if let Some((_, label)) = current_link.as_mut() {
                        append_text(label, &decoded);
                    }
                }
            }
            Token::Text(_) => {}
        }
    }

    Document {
        url: url.to_string(),
        title: title.map(|value| normalize_whitespace(&value)),
        text: normalize_whitespace(&text),
        links,
    }
}

fn tokenize(input: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut rest = input;

    while let Some(tag_start) = rest.find('<') {
        if tag_start > 0 {
            tokens.push(Token::Text(rest[..tag_start].to_string()));
        }

        rest = &rest[tag_start + 1..];
        let Some(tag_end) = rest.find('>') else {
            tokens.push(Token::Text(format!("<{rest}")));
            return tokens;
        };

        let tag = rest[..tag_end].trim();
        rest = &rest[tag_end + 1..];

        if tag.is_empty() || tag.starts_with('!') || tag.starts_with('?') {
            continue;
        }

        if let Some(stripped) = tag.strip_prefix('/') {
            tokens.push(Token::EndTag {
                name: tag_name(stripped),
            });
        } else {
            let (name, attrs) = parse_start_tag(tag);
            if !name.is_empty() {
                tokens.push(Token::StartTag { name, attrs });
            }
        }
    }

    if !rest.is_empty() {
        tokens.push(Token::Text(rest.to_string()));
    }

    tokens
}

fn parse_start_tag(tag: &str) -> (String, Vec<(String, String)>) {
    let name = tag_name(tag);
    let mut attrs = Vec::new();
    let mut rest = tag.get(name.len()..).unwrap_or("").trim();

    while !rest.is_empty() {
        rest = rest.trim_start_matches(|ch: char| ch.is_whitespace() || ch == '/');
        if rest.is_empty() {
            break;
        }

        let key_end = rest
            .find(|ch: char| ch.is_whitespace() || ch == '=' || ch == '/')
            .unwrap_or(rest.len());
        let key = rest[..key_end].to_ascii_lowercase();
        rest = rest[key_end..].trim_start();

        let value = if let Some(after_equals) = rest.strip_prefix('=') {
            rest = after_equals.trim_start();
            parse_attr_value(&mut rest)
        } else {
            String::new()
        };

        if !key.is_empty() {
            attrs.push((key, decode_entities(&value)));
        }
    }

    (name, attrs)
}

fn parse_attr_value(rest: &mut &str) -> String {
    if let Some(after_quote) = rest.strip_prefix('"') {
        if let Some(end) = after_quote.find('"') {
            *rest = &after_quote[end + 1..];
            return after_quote[..end].to_string();
        }
    }

    if let Some(after_quote) = rest.strip_prefix('\'') {
        if let Some(end) = after_quote.find('\'') {
            *rest = &after_quote[end + 1..];
            return after_quote[..end].to_string();
        }
    }

    let end = rest
        .find(|ch: char| ch.is_whitespace() || ch == '/')
        .unwrap_or(rest.len());
    let value = rest[..end].to_string();
    *rest = &rest[end..];
    value
}

fn tag_name(tag: &str) -> String {
    tag.trim_start()
        .split(|ch: char| ch.is_whitespace() || ch == '/' || ch == '>')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn attr<'a>(attrs: &'a [(String, String)], name: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

fn append_text(target: &mut String, value: &str) {
    for part in value.split_whitespace() {
        push_space(target);
        target.push_str(part);
    }
}

fn push_space(target: &mut String) {
    if !target.is_empty() && !target.ends_with(' ') {
        target.push(' ');
    }
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn resolve_url(base: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("file://") {
        return href.to_string();
    }

    if href.starts_with("//") {
        return format!("http:{href}");
    }

    if href.starts_with('/') {
        if let Some((scheme, rest)) = base.split_once("://") {
            let host = rest.split('/').next().unwrap_or(rest);
            return format!("{scheme}://{host}{href}");
        }
    }

    if let Some(last_slash) = base.rfind('/') {
        return format!("{}{}", &base[..last_slash + 1], href);
    }

    href.to_string()
}

#[cfg(test)]
mod tests {
    use super::parse_document;

    #[test]
    fn extracts_text_title_and_links() {
        let doc = parse_document(
            "http://example.test/docs/index.html",
            r#"<title>Example</title><h1>Hello &amp; welcome</h1><a href="/next">Next page</a>"#,
        );

        assert_eq!(doc.title.as_deref(), Some("Example"));
        assert_eq!(doc.text, "Hello & welcome Next page");
        assert_eq!(doc.links[0].text, "Next page");
        assert_eq!(doc.links[0].href, "http://example.test/next");
    }
}
