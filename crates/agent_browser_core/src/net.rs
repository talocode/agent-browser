use std::fmt::{Display, Formatter};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

const MAX_REDIRECTS: usize = 10;

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

    fetch_http(url, 0)
}

fn fetch_http(url: &str, redirects: usize) -> Result<String, FetchError> {
    if redirects > MAX_REDIRECTS {
        return Err(FetchError::InvalidResponse);
    }

    let request_url = parse_http_url(url)?;
    let mut stream = TcpStream::connect((request_url.host.as_str(), request_url.port))?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: agent-browser/0.1\r\nAccept: text/html,*/*;q=0.8\r\nConnection: close\r\n\r\n",
        request_url.path, request_url.authority
    );
    stream.write_all(request.as_bytes())?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;
    let Some(header_end) = find_header_end(&response) else {
        return Err(FetchError::InvalidResponse);
    };

    let head = String::from_utf8_lossy(&response[..header_end]);
    let response_head = ResponseHead::parse(&head)?;
    let body = &response[header_end + 4..];

    if response_head.is_redirect() {
        let Some(location) = response_head.header("location") else {
            return Err(FetchError::InvalidResponse);
        };
        let next_url = resolve_http_url(url, location);
        return fetch_http(&next_url, redirects + 1);
    }

    if response_head.status_code != 200 {
        let status = response_head.status_line;
        return Ok(format!("<pre>{status}</pre>"));
    }

    let body = if response_head
        .header("transfer-encoding")
        .is_some_and(|value| value.to_ascii_lowercase().contains("chunked"))
    {
        decode_chunked(body)?
    } else {
        body.to_vec()
    };

    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[derive(Debug)]
struct HttpUrl {
    authority: String,
    host: String,
    port: u16,
    path: String,
}

fn parse_http_url(url: &str) -> Result<HttpUrl, FetchError> {
    let Some(rest) = url.strip_prefix("http://") else {
        return Err(FetchError::UnsupportedScheme(url.to_string()));
    };

    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host_port = &rest[..authority_end];
    let (host, port) = parse_host_port(host_port)?;
    let mut path = match rest.as_bytes().get(authority_end) {
        Some(b'/') => rest[authority_end..].to_string(),
        Some(b'?') => format!("/{}", &rest[authority_end..]),
        _ => "/".to_string(),
    };

    if let Some(fragment_start) = path.find('#') {
        path.truncate(fragment_start);
    }

    Ok(HttpUrl {
        authority: host_port.to_string(),
        host,
        port,
        path,
    })
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

#[derive(Debug)]
struct ResponseHead {
    status_line: String,
    status_code: u16,
    headers: Vec<(String, String)>,
}

impl ResponseHead {
    fn parse(head: &str) -> Result<Self, FetchError> {
        let mut lines = head.lines();
        let status_line = lines
            .next()
            .ok_or(FetchError::InvalidResponse)?
            .trim()
            .to_string();
        let status_code = status_line
            .split_whitespace()
            .nth(1)
            .ok_or(FetchError::InvalidResponse)?
            .parse::<u16>()
            .map_err(|_| FetchError::InvalidResponse)?;
        let headers = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
            .collect();

        Ok(Self {
            status_line,
            status_code,
            headers,
        })
    }

    fn is_redirect(&self) -> bool {
        (300..400).contains(&self.status_code)
    }

    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header_name, _)| header_name == name)
            .map(|(_, value)| value.as_str())
    }
}

fn find_header_end(response: &[u8]) -> Option<usize> {
    response.windows(4).position(|window| window == b"\r\n\r\n")
}

fn decode_chunked(body: &[u8]) -> Result<Vec<u8>, FetchError> {
    let mut decoded = Vec::new();
    let mut index = 0usize;

    loop {
        let line_end = find_crlf(&body[index..])
            .map(|offset| index + offset)
            .ok_or(FetchError::InvalidResponse)?;
        let size_line =
            std::str::from_utf8(&body[index..line_end]).map_err(|_| FetchError::InvalidResponse)?;
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16).map_err(|_| FetchError::InvalidResponse)?;
        index = line_end + 2;

        if size == 0 {
            return Ok(decoded);
        }

        let chunk_end = index
            .checked_add(size)
            .filter(|end| *end <= body.len())
            .ok_or(FetchError::InvalidResponse)?;
        decoded.extend_from_slice(&body[index..chunk_end]);
        index = chunk_end;

        if body.get(index..index + 2) != Some(b"\r\n") {
            return Err(FetchError::InvalidResponse);
        }
        index += 2;
    }
}

fn find_crlf(bytes: &[u8]) -> Option<usize> {
    bytes.windows(2).position(|window| window == b"\r\n")
}

fn resolve_http_url(base: &str, location: &str) -> String {
    if location.starts_with("http://") {
        return location.to_string();
    }

    if location.starts_with("//") {
        return format!("http:{location}");
    }

    let Ok(base_url) = parse_http_url(base) else {
        return location.to_string();
    };

    if location.starts_with('/') {
        return format!("http://{}{}", base_url.authority, location);
    }

    let directory = base_url
        .path
        .rfind('/')
        .map(|last_slash| &base_url.path[..last_slash + 1])
        .unwrap_or("/");
    format!("http://{}{}{}", base_url.authority, directory, location)
}

#[cfg(test)]
mod tests {
    use super::{decode_chunked, fetch, parse_http_url};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn preserves_query_only_url_when_splitting_host() {
        let url = parse_http_url("http://example.test?x=1").expect("URL should parse");

        assert_eq!(url.host, "example.test");
        assert_eq!(url.path, "/?x=1");
    }

    #[test]
    fn decodes_chunked_body() {
        let decoded = decode_chunked(b"6\r\n<a hre\r\nC\r\nf=\"/x\">X</a>\r\n0\r\n\r\n")
            .expect("chunked body should decode");

        assert_eq!(decoded, br#"<a href="/x">X</a>"#);
    }

    #[test]
    fn follows_redirects_before_returning_body() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let address = listener.local_addr().expect("listener should have address");

        let server = thread::spawn(move || {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().expect("connection should arrive");
                let mut request = [0u8; 1024];
                let read = stream.read(&mut request).expect("request should read");
                let request = String::from_utf8_lossy(&request[..read]);
                let response = if request.starts_with("GET /start ") {
                    "HTTP/1.1 302 Found\r\nLocation: /final\r\nConnection: close\r\n\r\n"
                        .to_string()
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 15\r\nConnection: close\r\n\r\n<title>OK</title>"
                        .to_string()
                };
                stream
                    .write_all(response.as_bytes())
                    .expect("response should write");
            }
        });

        let body = fetch(&format!("http://{address}/start")).expect("redirect should fetch");
        server.join().expect("server should finish");

        assert_eq!(body, "<title>OK</title>");
    }

    #[test]
    fn decodes_chunked_http_responses_before_returning_body() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let address = listener.local_addr().expect("listener should have address");

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("connection should arrive");
            let mut request = [0u8; 1024];
            let _ = stream.read(&mut request).expect("request should read");
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n6\r\n<a hre\r\nC\r\nf=\"/x\">X</a>\r\n0\r\n\r\n",
                )
                .expect("response should write");
        });

        let body = fetch(&format!("http://{address}/")).expect("chunked page should fetch");
        server.join().expect("server should finish");

        assert_eq!(body, r#"<a href="/x">X</a>"#);
    }
}
