use std::fmt::{Display, Formatter};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

#[derive(Debug)]
pub enum FetchError {
    UnsupportedScheme(String),
    InvalidUrl(String),
    Io(std::io::Error),
    InvalidResponse,
}

impl Display for FetchError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedScheme(url) => write!(f, "unsupported URL scheme: {url}"),
            Self::InvalidUrl(url) => write!(f, "invalid URL: {url}"),
            Self::Io(error) => write!(f, "{error}"),
            Self::InvalidResponse => write!(f, "invalid HTTP response"),
        }
    }
}

impl std::error::Error for FetchError {}

impl From<std::io::Error> for FetchError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

pub fn fetch(url: &str) -> Result<String, FetchError> {
    if let Some(path) = url.strip_prefix("file://") {
        return Ok(fs::read_to_string(path)?);
    }

    if Path::new(url).exists() {
        return Ok(fs::read_to_string(url)?);
    }

    let Some(rest) = url.strip_prefix("http://") else {
        return Err(FetchError::UnsupportedScheme(url.to_string()));
    };

    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let (host, port) = parse_host_port(host_port)?;
    let path = format!("/{path}");
    let mut stream = TcpStream::connect((host.as_str(), port))?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: agent-browser/0.1\r\nAccept: text/html,*/*;q=0.8\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes())?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;
    let response = String::from_utf8_lossy(&response);
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return Err(FetchError::InvalidResponse);
    };

    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        let status = head.lines().next().unwrap_or("unknown status");
        return Ok(format!("<pre>{status}</pre>"));
    }

    Ok(body.to_string())
}

fn parse_host_port(value: &str) -> Result<(String, u16), FetchError> {
    if value.is_empty() {
        return Err(FetchError::InvalidUrl(value.to_string()));
    }

    if let Some((host, port)) = value.rsplit_once(':') {
        let port = port
            .parse::<u16>()
            .map_err(|_| FetchError::InvalidUrl(value.to_string()))?;
        return Ok((host.to_string(), port));
    }

    Ok((value.to_string(), 80))
}
