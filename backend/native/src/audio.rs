//! Audio, from FilmCraft's `audio-dsp` crate: the offset between two recordings of one event, the
//! restoration effects (DeHum, DeNoise, DeReverb, …) run offline over a whole recording, and EBU R128
//! loudness. Audio is mono or planar float32 (channels × samples).

use filmcraft_audio_dsp::{self as dsp, sync};
use numpy::{IntoPyArray, PyArray2, PyReadonlyArray1, PyReadonlyArray2};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyDict;

/// Where `b` lines up in `a`: `b[n]` matches `a[n + lag]`. None when nothing lines up.
#[pyfunction]
#[pyo3(signature = (a, b, sample_rate, max_lag_seconds=None))]
fn find_offset<'py>(py: Python<'py>, a: PyReadonlyArray1<'py, f32>, b: PyReadonlyArray1<'py, f32>, sample_rate: u32,
                    max_lag_seconds: Option<f64>) -> PyResult<Option<Bound<'py, PyDict>>> {
    let (a, b) = (a.as_slice()?, b.as_slice()?);
    let opts = sync::SyncOptions { max_lag: max_lag_seconds.map(|s| (s * sample_rate as f64) as i64), ..Default::default() };
    let Some(r) = py.allow_threads(|| sync::find_offset(a, b, sample_rate, &opts)) else { return Ok(None) };
    let out = PyDict::new(py);
    out.set_item("lag_samples", r.lag)?;
    out.set_item("lag_seconds", r.lag_fine / sample_rate as f64)?;
    out.set_item("confidence", r.confidence)?;
    out.set_item("distinct", r.distinct)?;
    out.set_item("inverted", r.inverted)?;
    out.set_item("reliable", r.reliable())?;
    Ok(Some(out))
}

/// Every effect: id, name, category and its parameters (id, name, min, max, default).
#[pyfunction]
fn effects(py: Python<'_>) -> PyResult<Vec<Bound<'_, PyDict>>> {
    dsp::effects().iter().map(|e| {
        let d = PyDict::new(py);
        d.set_item("id", e.id)?;
        d.set_item("name", e.name)?;
        d.set_item("category", format!("{:?}", e.category))?;
        let params: PyResult<Vec<_>> = e.params.iter().map(|p| {
            let q = PyDict::new(py);
            q.set_item("id", p.id)?;
            q.set_item("name", p.name)?;
            q.set_item("min", p.min)?;
            q.set_item("max", p.max)?;
            q.set_item("default", p.default)?;
            Ok(q)
        }).collect();
        d.set_item("params", params?)?;
        Ok(d)
    }).collect()
}

/// Run one effect over the whole recording (channels × samples) and return the result. The
/// effect's latency is compensated, so the output lines up with the input sample for sample.
#[pyfunction]
#[pyo3(signature = (effect, audio, sample_rate, params=None))]
fn process<'py>(py: Python<'py>, effect: &str, audio: PyReadonlyArray2<'py, f32>, sample_rate: f32,
                params: Option<std::collections::HashMap<String, f32>>) -> PyResult<Bound<'py, PyArray2<f32>>> {
    let arr = audio.as_array();
    let (channels, len) = arr.dim();
    let mut fx = dsp::create_effect(effect, sample_rate, channels)
        .ok_or_else(|| PyValueError::new_err(format!("no effect {effect:?}")))?;
    for (k, v) in params.unwrap_or_default() {
        if !fx.set_param(&k, v) {
            return Err(PyValueError::new_err(format!("{effect} has no parameter {k:?}")));
        }
    }
    let latency = fx.latency();
    let mut planes: Vec<Vec<f32>> = (0..channels).map(|c| {
        let mut v = arr.row(c).to_vec();
        v.resize(len + latency, 0.0); // flush the tail through the effect's delay
        v
    }).collect();
    py.allow_threads(|| {
        const BLOCK: usize = 4096;
        let total = len + latency;
        let mut start = 0;
        while start < total {
            let end = (start + BLOCK).min(total);
            let mut views: Vec<&mut [f32]> = planes.iter_mut().map(|p| &mut p[start..end]).collect();
            fx.process(&mut views);
            start = end;
        }
    });
    let out = numpy::ndarray::Array2::from_shape_fn((channels, len), |(c, i)| planes[c][i + latency]);
    Ok(out.into_pyarray(py))
}

/// EBU R128 / BS.1770-4 loudness: integrated (LUFS), loudness range (LU), true peak (dBTP).
#[pyfunction]
fn loudness<'py>(py: Python<'py>, audio: PyReadonlyArray2<'py, f32>, sample_rate: f64) -> PyResult<Bound<'py, PyDict>> {
    let arr = audio.as_array();
    let rows: Vec<Vec<f32>> = arr.rows().into_iter().map(|r| r.to_vec()).collect();
    let views: Vec<&[f32]> = rows.iter().map(|r| r.as_slice()).collect();
    let mut meter = dsp::LoudnessMeter::new(sample_rate, rows.len());
    meter.process(&views);
    let d = PyDict::new(py);
    d.set_item("integrated_lufs", meter.integrated())?;
    d.set_item("loudness_range_lu", meter.loudness_range())?;
    d.set_item("true_peak_dbtp", meter.true_peak_dbtp())?;
    d.set_item("sample_peak", meter.sample_peak())?;
    Ok(d)
}


pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(find_offset, m)?)?;
    m.add_function(wrap_pyfunction!(effects, m)?)?;
    m.add_function(wrap_pyfunction!(process, m)?)?;
    m.add_function(wrap_pyfunction!(loudness, m)?)?;
    Ok(())
}
