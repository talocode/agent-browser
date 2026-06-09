use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{BrowserError, BrowserSession};

#[derive(Debug, Deserialize, PartialEq, Eq)]
pub struct ProtocolCommand {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum ProtocolResponse {
    Success {
        id: String,
        ok: bool,
        result: Value,
    },
    Error {
        id: String,
        ok: bool,
        error: ProtocolError,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ProtocolError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct OpenParams {
    url: String,
}

#[derive(Debug, Deserialize)]
struct ClickParams {
    link_id: usize,
}

pub fn handle_command(session: &mut BrowserSession, command: ProtocolCommand) -> ProtocolResponse {
    let id = command.id;
    match command.method.as_str() {
        "open" => match parse_params::<OpenParams>(&command.params) {
            Ok(params) => response_from_result(id, session.open(&params.url)),
            Err(error) => error_response(id, error),
        },
        "snapshot" => response_from_result(id, session.snapshot()),
        "click" => match parse_params::<ClickParams>(&command.params) {
            Ok(params) => response_from_result(id, session.click(params.link_id)),
            Err(error) => error_response(id, error),
        },
        "history" => success_response(id, json!({ "entries": session.history() })),
        "shutdown" => success_response(id, json!({ "shutdown": true })),
        other => error_response(
            id,
            ProtocolError {
                code: "unknown_method".to_string(),
                message: format!("unknown method: {other}"),
            },
        ),
    }
}

pub fn parse_command(line: &str) -> Result<ProtocolCommand, ProtocolError> {
    serde_json::from_str(line).map_err(|error| ProtocolError {
        code: "invalid_request".to_string(),
        message: error.to_string(),
    })
}

pub fn success_response(id: String, result: Value) -> ProtocolResponse {
    ProtocolResponse::Success {
        id,
        ok: true,
        result,
    }
}

pub fn error_response(id: String, error: ProtocolError) -> ProtocolResponse {
    ProtocolResponse::Error {
        id,
        ok: false,
        error,
    }
}

fn response_from_result<T: Serialize>(
    id: String,
    result: Result<T, BrowserError>,
) -> ProtocolResponse {
    match result {
        Ok(value) => success_response(id, json!(value)),
        Err(error) => error_response(id, browser_error(error)),
    }
}

fn parse_params<T: for<'de> Deserialize<'de>>(params: &Value) -> Result<T, ProtocolError> {
    serde_json::from_value(params.clone()).map_err(|error| ProtocolError {
        code: "invalid_params".to_string(),
        message: error.to_string(),
    })
}

fn browser_error(error: BrowserError) -> ProtocolError {
    let code = match &error {
        BrowserError::Fetch(_) => "fetch_error",
        BrowserError::NoDocumentOpen => "no_document_open",
        BrowserError::LinkNotFound(_) => "link_not_found",
    };

    ProtocolError {
        code: code.to_string(),
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{ProtocolResponse, handle_command, parse_command};
    use crate::BrowserSession;

    #[test]
    fn parses_valid_command() {
        let command =
            parse_command(r#"{"id":"1","method":"open","params":{"url":"fixture.html"}}"#)
                .expect("command should parse");

        assert_eq!(command.id, "1");
        assert_eq!(command.method, "open");
        assert_eq!(command.params["url"], "fixture.html");
    }

    #[test]
    fn rejects_malformed_json() {
        let error = parse_command(r#"{"id":"1","method":"open""#).expect_err("invalid JSON");

        assert_eq!(error.code, "invalid_request");
    }

    #[test]
    fn returns_structured_no_document_error() {
        let mut session = BrowserSession::new();
        let response = handle_command(
            &mut session,
            parse_command(r#"{"id":"3","method":"click","params":{"link_id":7}}"#).unwrap(),
        );

        match response {
            ProtocolResponse::Error { id, ok, error } => {
                assert_eq!(id, "3");
                assert!(!ok);
                assert_eq!(error.code, "no_document_open");
            }
            ProtocolResponse::Success { .. } => panic!("expected error"),
        }
    }

    #[test]
    fn handles_sessionful_open_click_history_and_shutdown() {
        let root = env!("CARGO_MANIFEST_DIR");
        let fixture = format!("{root}/../../fixtures/example.html");
        let mut session = BrowserSession::new();

        let open = handle_command(
            &mut session,
            parse_command(&format!(
                r#"{{"id":"1","method":"open","params":{{"url":{}}}}}"#,
                serde_json::to_string(&fixture).unwrap()
            ))
            .unwrap(),
        );
        assert!(matches!(open, ProtocolResponse::Success { .. }));

        let click = handle_command(
            &mut session,
            parse_command(r#"{"id":"2","method":"click","params":{"link_id":0}}"#).unwrap(),
        );
        assert!(matches!(click, ProtocolResponse::Success { .. }));

        let missing_link = handle_command(
            &mut session,
            parse_command(r#"{"id":"missing","method":"click","params":{"link_id":7}}"#).unwrap(),
        );
        match missing_link {
            ProtocolResponse::Error { id, ok, error } => {
                assert_eq!(id, "missing");
                assert!(!ok);
                assert_eq!(error.code, "link_not_found");
            }
            ProtocolResponse::Success { .. } => panic!("expected error"),
        }

        let history = handle_command(
            &mut session,
            parse_command(r#"{"id":"3","method":"history"}"#).unwrap(),
        );
        match history {
            ProtocolResponse::Success { id, ok, result } => {
                assert_eq!(id, "3");
                assert!(ok);
                assert_eq!(result["entries"].as_array().unwrap().len(), 2);
            }
            ProtocolResponse::Error { .. } => panic!("expected success"),
        }

        let shutdown = handle_command(
            &mut session,
            parse_command(r#"{"id":"4","method":"shutdown"}"#).unwrap(),
        );
        match shutdown {
            ProtocolResponse::Success { id, ok, result } => {
                assert_eq!(id, "4");
                assert!(ok);
                assert_eq!(result["shutdown"], true);
            }
            ProtocolResponse::Error { .. } => panic!("expected success"),
        }
    }
}
