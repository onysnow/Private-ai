//! PDFs, from PdfCraft's automation layer: one session per job, with every path it reads or writes
//! confined to one folder. Each tool takes and returns JSON (`PdfSession.tools()` lists them with their
//! schemas); the Workbench calls them by name.
//!
//! A session never writes over a file it was given. Every file already in the folder when the session
//! starts, and every file it opens, is protected: a save or `out` naming one is refused before the tool
//! runs, and after any tool that can write, each protected file is checked to be the same file, the same
//! size and the same age as before; if one changed, the call is an error and its result is not used.

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use pdfcraft_automation::{Automation, Content};
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyBytes;

/// Tool arguments that name a file the tool writes.
const OUTPUT_KEYS: &[&str] = &["out"];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
    #[cfg(unix)]
    inode: u64,
}

fn stamp(path: &Path) -> Option<Stamp> {
    let m = std::fs::metadata(path).ok()?;
    Some(Stamp {
        len: m.len(),
        modified: m.modified().ok(),
        #[cfg(unix)]
        inode: std::os::unix::fs::MetadataExt::ino(&m),
    })
}

fn files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() => files_under(&path, out),
            Ok(t) if t.is_file() => out.push(path),
            _ => {}
        }
    }
}

#[pyclass(unsendable)]
struct PdfSession {
    auto: Automation,
    root: PathBuf,
    protected: BTreeMap<PathBuf, Option<Stamp>>,
}

impl PdfSession {
    /// Where `name` lands inside the root: `..` resolved by name first (as PdfCraft resolves it), then the deepest
    /// existing folder's links followed.
    fn target(&self, name: &str) -> PathBuf {
        let mut lexical = PathBuf::new();
        for part in self.root.join(name).components() {
            match part {
                Component::ParentDir => {
                    lexical.pop();
                }
                Component::CurDir => {}
                other => lexical.push(other),
            }
        }
        let mut existing = lexical.as_path();
        let mut rest = Vec::new();
        while !existing.exists() {
            match (existing.file_name(), existing.parent()) {
                (Some(file), Some(parent)) => {
                    rest.push(file.to_owned());
                    existing = parent;
                }
                _ => return lexical,
            }
        }
        let mut real = existing.canonicalize().unwrap_or_else(|_| existing.to_path_buf());
        real.extend(rest.iter().rev());
        real
    }

    fn protect(&mut self, path: PathBuf) {
        let canonical = path.canonicalize().unwrap_or(path);
        let now = stamp(&canonical);
        self.protected.entry(canonical).or_insert(now);
    }
}

#[pymethods]
impl PdfSession {
    /// A session whose tools may only touch files inside `root`; the files in it now are its inputs.
    #[new]
    fn new(root: &str) -> PyResult<Self> {
        let root = Path::new(root).canonicalize().map_err(|e| PyValueError::new_err(format!("{root}: {e}")))?;
        let auto = Automation::new().with_root(&root).map_err(|e| PyValueError::new_err(e.to_string()))?;
        let mut session = PdfSession { auto, root: root.clone(), protected: BTreeMap::new() };
        let mut inputs = Vec::new();
        files_under(&root, &mut inputs);
        for path in inputs {
            session.protect(path);
        }
        Ok(session)
    }

    /// Run one tool. Returns a list of results: a JSON string, or (png bytes, width, height).
    fn call(&mut self, py: Python<'_>, tool: &str, args_json: &str) -> PyResult<Vec<PyObject>> {
        let args: serde_json::Value = serde_json::from_str(args_json).map_err(|e| PyValueError::new_err(e.to_string()))?;
        let read_only = pdfcraft_automation::tools().iter().find(|t| t.name == tool).is_some_and(|t| t.read_only);
        // Saving in place would write over the file that was opened; a result is always a new file.
        let mut targets: Vec<&str> = OUTPUT_KEYS.iter().filter_map(|k| args.get(*k).and_then(|v| v.as_str())).collect();
        if tool == "doc_save" {
            match args.get("path").and_then(|p| p.as_str()).filter(|p| !p.is_empty()) {
                Some(path) => targets.push(path),
                None => return Err(PyValueError::new_err("doc_save needs a new `path`: the opened file is never written over")),
            }
        }
        for name in targets {
            let target = self.target(name);
            if self.protected.contains_key(&target) {
                return Err(PyValueError::new_err(format!("{name} is one of this job's inputs and is never written over")));
            }
        }
        let out = self.auto.call(tool, &args).map_err(|e| PyRuntimeError::new_err(e.to_string()))?;
        if !read_only {
            if let Some(changed) = self.protected.iter().find(|(path, before)| stamp(path) != **before).map(|(p, _)| p.clone()) {
                return Err(PyRuntimeError::new_err(format!(
                    "{tool} changed {}, one of this job's inputs; its result is not used", changed.display())));
            }
        }
        if tool == "doc_open" {
            if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
                let target = self.target(path);
                self.protect(target);
            }
        }
        out.into_iter().map(|c| match c {
            Content::Json(v) => Ok(v.to_string().into_pyobject(py)?.into_any().unbind()),
            Content::Png { data, width, height } => Ok((PyBytes::new(py, &data), width, height).into_pyobject(py)?.into_any().unbind()),
        }).collect()
    }

    /// Every tool, with its JSON Schema, as one JSON string.
    #[staticmethod]
    fn tools() -> String {
        serde_json::to_string(&pdfcraft_automation::tools().iter().map(|t| serde_json::json!({
            "name": t.name, "description": t.description, "input_schema": t.input_schema,
            "read_only": t.read_only, "destructive": t.destructive,
        })).collect::<Vec<_>>()).unwrap_or_default()
    }
}

pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PdfSession>()?;
    Ok(())
}
