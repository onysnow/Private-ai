# Light catalogue: what the engine models now (2026-09-30)

The current status of Part 3 of `claude/light-physics-reference.md` (the equations and sources are there). Kept up to date as behaviours move from Plan to Preview to Now.

Status: **Now** = modelled today · **Preview** = built behind a `?try=` switch, waiting for Ony · **Plan** = in the design, to build · **Camera** = belongs to the camera stage · **No** = not visible at this scale (reason given).

Updated 2026-09-30 with what the light engine steps E–I and item 32 have built.

### 3.1 Sources

| Behaviour                                     | Equation or model                              | Status                                                      |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Point and area lamps, size gives soft shadows | radius → penumbra                              | Now (cursor lamp, flash, flare, neon, glow paint)           |
| Inverse-square falloff                        | E = I / d²                                     | Now                                                         |
| Lambert cosine law                            | E ∝ cosθ                                       | Now                                                         |
| Colour from temperature                       | Planck blackbody → CIE 1931 → linear sRGB      | Preview `?try=kelvin` (the lamp; `effects/light/blackbody`) |
| Environment / room light                      | radiance from an HDR image × power             | Now (room)                                                  |
| Emissive images (bright spots of photos)      | extracted highlights as lights under the glass | Preview `?try=photolights` (`effects/light/photo-emitters`) |
| Backlight                                     | one light behind the glass (Light.below)       | Preview `?try=backlight`                                    |
| Beams (reflector lamps)                       | super-Gaussian hotspot + spill, Light.aim      | Preview `?try=flashlight` (`effects/light/beam`)            |

### 3.2 At a surface

| Behaviour                                    | Equation or model                                                                                     | Status                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Refraction                                   | Snell: n₁ sinθ₁ = n₂ sinθ₂                                                                            | Now                                                                                           |
| Fresnel reflection / transmission            | Rs, Rp exactly; unpolarised R = (Rs+Rp)/2; 4.23% at normal                                            | Now (Schlick); Preview `?try=polariser` (exact s/p, `fresnelS`, `fresnelP`)                   |
| Brewster angle                               | tanθB = n₂/n₁ = 56.6°, where p-polarised reflection is 0                                              | Preview `?try=polariser` (tested)                                                             |
| Total internal reflection                    | sinθc = n₂/n₁ → 41.2°                                                                                 | Now (light guide, side mirror, echo, crack faces)                                             |
| Frustrated TIR                               | exp(−2κg) tunnelling                                                                                  | Preview `?try=contact` (modelled and tested)                                                  |
| Evanescent-wave lateral shift (Goos–Hänchen) | sub-wavelength shift                                                                                  | No: far below a pixel                                                                         |
| Rough reflection (frost, satin)              | microfacet GGX BRDF                                                                                   | Now                                                                                           |
| Rough transmission (frosted face)            | microfacet BTDF ([Walter et al. 2007](https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.html)) | Now (approximate); Preview `?try=roughglass` (full BTDF, `effects/optics/rough-transmission`) |
| Diffuse reflection (paper, photo)            | Lambert, one bounce                                                                                   | Preview `?try=bounce`                                                                         |
| Thin-film interference                       | Airy, CIE colour, Bennett–Porteus roughness loss                                                      | Preview `?try=contact` (`effects/optics/thin-film`)                                           |
| Anti-reflection coatings                     | quarter-wave film                                                                                     | Preview `?try=coating` (museum glass, `effects/optics/coating`)                               |

### 3.3 Inside a material

| Behaviour                             | Equation or model                       | Status                                                                                                                         |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Absorption and tint                   | Beer–Lambert: T = exp(−α·L) per colour  | Now (float glass green, side faces)                                                                                            |
| Dispersion                            | Cauchy from nd and Abbe V               | Now (glass solids, laser, flashlight crack split, liquid edge preview); the pane's three-channel split in CSS mode stays fixed |
| Lateral displacement, apparent depth  | d = t·sin(θi−θt)/cosθt; depth ≈ t/n     | Now (stacks, crack faces seen at 1/n depth)                                                                                    |
| Light guiding                         | TIR between faces; escape by scattering | Now                                                                                                                            |
| Volume scattering (haze, milky glass) | Rayleigh ∝ λ⁻⁴                          | Preview `?try=coating` (opal glass, `effects/optics/scatter`)                                                                  |
| Birefringence                         | two indices by polarisation             | No: float glass is isotropic (tempered glass shows stress patterns only in polarised light)                                    |

### 3.4 Between surfaces (transport)

| Behaviour                          | Equation or model                                    | Status                                                   |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Shadows: umbra and penumbra        | the one shadow model                                 | Now                                                      |
| Caustics (focused light)           | Jacobian of the ray map; photon splatting for solids | Now (edge band, waviness, glass solids)                  |
| Multiple reflections between panes | adding equations, 1/(1−RR)                           | Now (stacks)                                             |
| Ghost and double images            | offsets 2g·tanθ, 2t·tanθt                            | Now (stacks)                                             |
| Specular bounce                    | image-source lights                                  | Now: balloons (`effects/light/image-sources`; Fresnel R0 4.3%, through its pane only) |
| Diffuse bounce                     | one bounce patch per light                           | Preview `?try=bounce`                                    |

### 3.5 Wave effects

| Behaviour                                               | Status                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Interference (thin films, Newton's rings)               | Preview `?try=contact`                                                                                             |
| Diffraction at glass edges                              | No: the bands are a few wavelengths wide, far below a pixel                                                        |
| Diffraction at the camera aperture (starbursts, spikes) | Camera: in the lens (blade count now a control)                                                                    |
| Polarisation                                            | Preview `?try=polariser`: s and p through Fresnel for the room's reflection, and a polarising filter on the camera |
| Fluorescence, phosphorescence                           | Now: black light (grime, optical brighteners, orange plastic) and glow paint (SrAl₂O₄:Eu,Dy)                       |

### 3.6 Camera and eye (the recording, not the scene)

| Behaviour                             | Status                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Exposure and tonemapping              | Now (film burn as a preview, `?try=burn`)                                                                                      |
| Bloom and glare                       | Now                                                                                                                            |
| Lens ghosts, halo, aperture shape     | Now (11 more lens controls: ghost count, spacing, size, shape, bokeh, blades, cat's eye, rainbow, halo rings, halo size, star) |
| Chromatic aberration of the lens      | Now                                                                                                                            |
| Polarising filter                     | Preview `?try=polariser`                                                                                                       |
| Depth of field (the photos' own blur) | In the photographs themselves                                                                                                  |
| Vignetting                            | Preview `?try=vignette` (cos⁴ law, `effects/camera/vignette`)                                                                  |
| Afterimage and adaptation             | Now                                                                                                                            |
