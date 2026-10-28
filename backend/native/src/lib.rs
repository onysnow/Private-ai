//! `workbench_native`: code from the ArtCraft apps compiled into the Workbench (NOTICE.md).
//! `audio` (FilmCraft), `photo` (LightCraft) and `pdf` (PdfCraft) are its submodules.
//! Nothing here writes over a file it reads: every result is returned, or written where the caller says.

use pyo3::prelude::*;

mod audio;
mod pdf;
mod photo;

fn sub<'py>(parent: &Bound<'py, PyModule>, name: &str, register: fn(&Bound<'py, PyModule>) -> PyResult<()>) -> PyResult<()> {
    let m = PyModule::new(parent.py(), name)?;
    register(&m)?;
    parent.add_submodule(&m)?;
    // Make `import workbench_native.audio` work as well as attribute access.
    parent.py().import("sys")?.getattr("modules")?.set_item(format!("workbench_native.{name}"), &m)?;
    Ok(())
}

#[pymodule]
fn workbench_native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    sub(m, "audio", audio::register)?;
    sub(m, "photo", photo::register)?;
    sub(m, "pdf", pdf::register)?;
    Ok(())
}
