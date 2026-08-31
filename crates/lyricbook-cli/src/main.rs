use clap::{Parser, Subcommand};
use lyricbook_core::{Project, booklet_imposition, padded_booklet_page_count, validate_project};
use std::{
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

#[derive(Debug, Parser)]
#[command(name = "lyricbook", version, about = "Validate and inspect LyricBook projects")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Validate a project JSON file.
    Validate { path: PathBuf },
    /// Print saddle-stitch imposition pairs.
    Booklet {
        /// Logical page count; it is padded to a multiple of four.
        pages: usize,
    },
    /// Print a compact project summary.
    Inspect { path: PathBuf },
}

fn load_project(path: &Path) -> Result<Project, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn run() -> Result<(), String> {
    match Cli::parse().command {
        Command::Validate { path } => {
            let project = load_project(&path)?;
            validate_project(&project).map_err(|error| error.to_string())?;
            println!("valid: {}", project.id);
        }
        Command::Booklet { pages } => {
            let padded = padded_booklet_page_count(pages);
            for (index, sheet) in booklet_imposition(padded)?.iter().enumerate() {
                println!(
                    "sheet {}: {}|{} / {}|{}",
                    index + 1,
                    sheet.0,
                    sheet.1,
                    sheet.2,
                    sheet.3
                );
            }
        }
        Command::Inspect { path } => {
            let project = load_project(&path)?;
            validate_project(&project).map_err(|error| error.to_string())?;
            println!("id: {}", project.id);
            println!("songs: {}", project.songs.len());
            println!("setlists: {}", project.setlists.len());
            println!("themes: {}", project.themes.len());
            println!("sources: {}", project.sources.len());
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}
