use std::env;
use std::io::{self, BufRead, Write};
use std::process::ExitCode;

use agent_browser_core::{
    BrowserSession, ProtocolResponse, Snapshot, handle_command, parse_command,
};

fn main() -> ExitCode {
    let mut args = env::args().skip(1).collect::<Vec<_>>();
    let json = take_flag(&mut args, "--json");
    let mut args = args.into_iter();
    let Some(command) = args.next() else {
        print_usage();
        return ExitCode::from(2);
    };

    let result = match command.as_str() {
        "serve" => return serve(),
        "open" => {
            let Some(url) = args.next() else {
                eprintln!("missing URL");
                return ExitCode::from(2);
            };
            let mut session = BrowserSession::new();
            session.open(&url)
        }
        "snapshot" => {
            let Some(url) = args.next() else {
                eprintln!("missing URL");
                return ExitCode::from(2);
            };
            let mut session = BrowserSession::new();
            session.open(&url)
        }
        _ => {
            eprintln!("unknown command: {command}");
            print_usage();
            return ExitCode::from(2);
        }
    };

    match result {
        Ok(snapshot) => {
            if json {
                print_snapshot_json(&snapshot);
            } else {
                print_snapshot(&snapshot);
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn print_usage() {
    eprintln!("usage:");
    eprintln!("  agent-browser serve");
    eprintln!("  agent-browser [--json] open <http-url|file-path>");
    eprintln!("  agent-browser [--json] snapshot <http-url|file-path>");
}

fn take_flag(args: &mut Vec<String>, flag: &str) -> bool {
    if let Some(index) = args.iter().position(|arg| arg == flag) {
        args.remove(index);
        true
    } else {
        false
    }
}

fn print_snapshot(snapshot: &Snapshot) {
    println!("url: {}", snapshot.url);
    if let Some(title) = &snapshot.title {
        println!("title: {title}");
    }
    println!();
    println!("{}", snapshot.text);

    if !snapshot.links.is_empty() {
        println!();
        println!("links:");
        for link in &snapshot.links {
            println!("  [{}] {} -> {}", link.id, link.text, link.href);
        }
    }
}

fn print_snapshot_json(snapshot: &Snapshot) {
    println!(
        "{}",
        serde_json::to_string_pretty(snapshot).expect("snapshot serialization should not fail")
    );
}

fn serve() -> ExitCode {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    serve_lines(stdin.lock(), &mut stdout)
}

fn serve_lines(input: impl BufRead, mut stdout: &mut impl Write) -> ExitCode {
    let mut session = BrowserSession::new();

    for line in input.lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("error reading stdin: {error}");
                return ExitCode::FAILURE;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let shutdown = match parse_command(&line) {
            Ok(command) => {
                let shutdown = command.method == "shutdown";
                let response = handle_command(&mut session, command);
                if write_response(&mut stdout, &response).is_err() {
                    return ExitCode::FAILURE;
                }
                shutdown
            }
            Err(error) => {
                let response = ProtocolResponse::Error {
                    id: String::new(),
                    ok: false,
                    error,
                };
                if write_response(&mut stdout, &response).is_err() {
                    return ExitCode::FAILURE;
                }
                false
            }
        };

        if shutdown {
            return ExitCode::SUCCESS;
        }
    }

    ExitCode::SUCCESS
}

fn write_response(
    stdout: &mut impl Write,
    response: &ProtocolResponse,
) -> Result<(), serde_json::Error> {
    serde_json::to_writer(&mut *stdout, response)?;
    writeln!(stdout).map_err(serde_json::Error::io)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::process::ExitCode;

    use serde_json::Value;

    use super::serve_lines;

    #[test]
    fn serve_lines_returns_jsonl_responses_with_matching_ids() {
        let root = env!("CARGO_MANIFEST_DIR");
        let fixture = format!("{root}/../../fixtures/example.html");
        let input = format!(
            "{{\"id\":\"1\",\"method\":\"open\",\"params\":{{\"url\":{}}}}}\n\
             {{\"id\":\"2\",\"method\":\"snapshot\"}}\n\
             {{\"id\":\"3\",\"method\":\"click\",\"params\":{{\"link_id\":0}}}}\n\
             {{\"id\":\"4\",\"method\":\"back\"}}\n\
             {{\"id\":\"5\",\"method\":\"forward\"}}\n\
             {{\"id\":\"6\",\"method\":\"reload\"}}\n\
             {{\"id\":\"7\",\"method\":\"history\"}}\n\
             {{\"id\":\"8\",\"method\":\"shutdown\"}}\n",
            serde_json::to_string(&fixture).unwrap()
        );
        let mut output = Vec::new();

        let code = serve_lines(Cursor::new(input), &mut output);

        assert_eq!(code, ExitCode::SUCCESS);
        let output = String::from_utf8(output).unwrap();
        let responses = output
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .collect::<Vec<_>>();

        assert_eq!(responses.len(), 8);
        for (index, response) in responses.iter().enumerate() {
            let expected_id = (index + 1).to_string();
            assert_eq!(response["id"].as_str(), Some(expected_id.as_str()));
            assert_eq!(response["ok"], true);
        }
        assert_eq!(responses[7]["result"]["shutdown"], true);
    }

    #[test]
    fn serve_lines_reports_malformed_json_without_panicking() {
        let mut output = Vec::new();

        let code = serve_lines(Cursor::new("{bad json}\n"), &mut output);

        assert_eq!(code, ExitCode::SUCCESS);
        let response = serde_json::from_slice::<Value>(&output).unwrap();
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalid_request");
    }
}
