//! PDFs, from PdfCraft's automation layer: one session per job, with every path it reads or writes
//! confined to one folder. Each tool takes and returns JSON (`PdfSession.tools()` lists them with their
//! schemas); the Workbench calls them by name. Saving always writes a new file the caller names.

use pdfcraft_automation::{Automation, Content};
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyBytes;

#[pyclass(unsendable)]
struct PdfSession(Automation);

#[pymethods]
impl PdfSession {
    /// A session whose tools may only touch files inside `root`.
    #[new]
    fn new(root: &str) -> PyResult<Self> {
        Automation::new().with_root(root).map(PdfSession).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    /// Run one tool. Returns a list of results: a JSON string, or (png bytes, width, height).
    fn call<'py>(&mut self, py: Python<'py>, tool: &str, args_json: &str) -> PyResult<Vec<PyObject>> {
        let args: serde_json::Value = serde_json::from_str(args_json).map_err(|e| PyValueError::new_err(e.to_string()))?;
        // Saving in place would write over the file that was opened; a result is always a new file.
        if tool == "doc_save" && args.get("path").and_then(|p| p.as_str()).is_none_or(str::is_empty) {
            return Err(PyValueError::new_err("doc_save needs a new `path`: the opened file is never written over"));
        }
        let out = self.0.call(tool, &args).map_err(|e| PyRuntimeError::new_err(e.to_string()))?;
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
        })).collect::<Vec<_>>()).unwrap_or_default()
    }
}

pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PdfSession>()?;
    Ok(())
}
