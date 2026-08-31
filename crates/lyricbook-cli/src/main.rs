use lyricbook_core::{booklet_imposition, validate_project, Project};
use std::{env, fs, process};

fn main() {
    let args: Vec<String> = env::args().collect();
    match args.as_slice() {
        [_, command, path] if command == "validate" => {
            let content = fs::read_to_string(path).unwrap_or_else(|error| fail(&error.to_string()));
            let project: Project = serde_json::from_str(&content).unwrap_or_else(|error| fail(&error.to_string()));
            validate_project(&project).unwrap_or_else(|error| fail(&error.to_string()));
            println!("valid: {}", project.id);
        }
        [_, command, pages] if command == "booklet" => {
            let pages: usize = pages.parse().unwrap_or_else(|_| fail("pages must be an integer"));
            let sheets = booklet_imposition(pages).unwrap_or_else(|error| fail(&error));
            for (index, sheet) in sheets.iter().enumerate() {
                println!("sheet {}: {}|{} / {}|{}", index + 1, sheet.0, sheet.1, sheet.2, sheet.3);
            }
        }
        _ => {
            eprintln!("Usage:\n  lyricbook validate <project.json>\n  lyricbook booklet <page-count>");
            process::exit(2);
        }
    }
}

fn fail(message: &str) -> ! {
    eprintln!("error: {message}");
    process::exit(1);
}
