//! Photos, from LightCraft: what a photo file says about itself (EXIF, XMP, IPTC), the preview a
//! camera embeds in its RAW file, HEIC decoding, and the YuNet face *detector*. Only detection is
//! exposed: LightCraft's face recognition and matching are left out on purpose (media research §4.5).

use lightcraft_faces::yunet;
use numpy::{IntoPyArray, PyArray3, PyReadonlyArray3};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict};

fn opt<'py, T: IntoPyObject<'py>>(d: &Bound<'py, PyDict>, k: &str, v: Option<T>) -> PyResult<()> {
    if let Some(v) = v { d.set_item(k, v)?; }
    Ok(())
}

/// What the file says about itself (EXIF, IPTC, XMP in JPEG, PNG, WebP, TIFF and RAW files). Only
/// fields the file has are present.
#[pyfunction]
fn metadata<'py>(py: Python<'py>, data: &[u8]) -> PyResult<Bound<'py, PyDict>> {
    let m = py.allow_threads(|| lightcraft_meta::extract(data));
    to_dict(py, m)
}

/// The same from a bare EXIF block (as `decode_heic` returns it).
#[pyfunction]
fn metadata_from_exif<'py>(py: Python<'py>, exif: &[u8]) -> PyResult<Bound<'py, PyDict>> {
    to_dict(py, lightcraft_meta::read_exif(lightcraft_meta::strip_exif_header(exif)))
}

fn to_dict(py: Python<'_>, m: lightcraft_meta::Metadata) -> PyResult<Bound<'_, PyDict>> {
    let d = PyDict::new(py);
    opt(&d, "make", m.make)?;
    opt(&d, "model", m.model)?;
    opt(&d, "serial_number", m.serial_number)?;
    opt(&d, "software", m.software)?;
    opt(&d, "lens_make", m.lens_make)?;
    opt(&d, "lens_model", m.lens_model)?;
    opt(&d, "lens_serial_number", m.lens_serial_number)?;
    if let Some(t) = m.capture_time {
        d.set_item("capture_time", t.to_iso())?;
        d.set_item("capture_time_has_offset", t.offset_minutes.is_some())?;
    }
    opt(&d, "exposure_time", m.exposure_time)?;
    opt(&d, "f_number", m.f_number)?;
    opt(&d, "iso", m.iso)?;
    opt(&d, "focal_length", m.focal_length)?;
    if let Some(g) = m.gps {
        let gd = PyDict::new(py);
        gd.set_item("latitude", g.latitude)?;
        gd.set_item("longitude", g.longitude)?;
        opt(&gd, "altitude", g.altitude)?;
        d.set_item("gps", gd)?;
    }
    opt(&d, "orientation", m.orientation.map(|o| o.to_exif()))?;
    opt(&d, "width", m.width)?;
    opt(&d, "height", m.height)?;
    opt(&d, "artist", m.artist)?;
    opt(&d, "copyright", m.copyright)?;
    opt(&d, "title", m.title)?;
    opt(&d, "caption", m.caption)?;
    opt(&d, "city", m.city)?;
    opt(&d, "state", m.state)?;
    opt(&d, "country", m.country)?;
    if !m.keywords.is_empty() { d.set_item("keywords", m.keywords)?; }
    Ok(d)
}

/// Every tag in the file as (group, name, value) rows, for a "show everything" view.
#[pyfunction]
fn tags(data: &[u8]) -> Vec<(String, String, String)> {
    lightcraft_meta::file_tag_rows(data).into_iter().map(|r| (r.group.to_string(), r.name, r.value)).collect()
}

/// The camera's own JPEG preview inside a RAW file (None when the file is not RAW or has none).
#[pyfunction]
fn raw_preview<'py>(py: Python<'py>, data: &[u8]) -> Option<Bound<'py, PyBytes>> {
    let jpeg = py.allow_threads(|| lightcraft_raw::embedded_preview(data))?;
    Some(PyBytes::new(py, &jpeg))
}

/// The RAW format's name, or None when the bytes are not a RAW file LightCraft knows.
#[pyfunction]
fn raw_format(data: &[u8]) -> Option<String> {
    lightcraft_raw::probe(data).map(|f| format!("{f:?}"))
}

/// A HEIC/HEIF photo decoded to 16-bit RGB(A), height × width × channels, plus its EXIF bytes.
#[pyfunction]
#[pyo3(signature = (data, max_pixels=200_000_000))]
fn decode_heic<'py>(py: Python<'py>, data: &[u8], max_pixels: u64) -> PyResult<(Bound<'py, PyArray3<u16>>, u8, Option<Bound<'py, PyBytes>>)> {
    let opts = lightcraft_heif::Options { max_pixels, apply_transforms: true };
    let img = py.allow_threads(|| lightcraft_heif::decode(data, &opts)).map_err(|e| PyValueError::new_err(e.to_string()))?;
    let ch = if img.has_alpha { 4 } else { 3 };
    let arr = numpy::ndarray::Array3::from_shape_vec((img.height as usize, img.width as usize, ch), img.data)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    let exif = img.exif.map(|e| PyBytes::new(py, &e));
    Ok((arr.into_pyarray(py), img.bit_depth, exif))
}

/// YuNet face detector. Boxes are fractions of the picture's width and height.
#[pyclass]
struct FaceDetector(yunet::Detector);

#[pymethods]
impl FaceDetector {
    #[new]
    fn new(model: &[u8]) -> PyResult<Self> {
        yunet::Detector::new(model).map(FaceDetector).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    /// Faces in an RGB picture (height × width × 3, uint8).
    #[pyo3(signature = (rgb, min_score=0.6))]
    fn detect<'py>(&self, py: Python<'py>, rgb: PyReadonlyArray3<'py, u8>, min_score: f32) -> PyResult<Vec<Bound<'py, PyDict>>> {
        let (h, w, c) = rgb.as_array().dim();
        if c != 3 { return Err(PyValueError::new_err("expected height × width × 3 RGB")); }
        let pixels = rgb.as_slice()?;
        let opts = yunet::Options { score: min_score, ..Default::default() };
        let faces = py.allow_threads(|| self.0.detect(pixels, w, h, &opts)).map_err(|e| PyValueError::new_err(e.to_string()))?;
        faces.iter().map(|f| {
            let d = PyDict::new(py);
            d.set_item("box", (f.x0, f.y0, f.x1, f.y1))?;
            d.set_item("score", f.score)?;
            Ok(d)
        }).collect()
    }
}


pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(metadata, m)?)?;
    m.add_function(wrap_pyfunction!(metadata_from_exif, m)?)?;
    m.add_function(wrap_pyfunction!(tags, m)?)?;
    m.add_function(wrap_pyfunction!(raw_preview, m)?)?;
    m.add_function(wrap_pyfunction!(raw_format, m)?)?;
    m.add_function(wrap_pyfunction!(decode_heic, m)?)?;
    m.add_class::<FaceDetector>()?;
    Ok(())
}
