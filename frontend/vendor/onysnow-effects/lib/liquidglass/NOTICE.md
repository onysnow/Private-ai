# liquidglass — vendored source

This directory is a verbatim copy of **[ybouane/liquidglass](https://github.com/ybouane/liquidglass)**
(npm: `@ybouane/liquidglass`, v1.0.3), used under the **MIT Licence**.

## Why it is vendored rather than installed

Because we are going to change it. The whole reason this pipeline is here is
that `backdrop-filter` cannot bend what is behind a pane — it can blur the
backdrop or push it around, but it can never answer "what colour is the page at
some *other* point", and that question is the whole of refraction. This library
answers it by rasterising the page into a texture and sampling that texture in
a fragment shader.

Having got that, the next thing we want is to fold this site's own light system
into the same shader: the raking grime, the transmitted pool, the cast shadows,
the environment reflection. None of that is upstream's problem, and none of it
can be bolted on from outside a shader that is already computing the surface
normal and the refracted ray. A dependency in `node_modules` is exactly the
wrong shape for that — you cannot iterate on top of something you cannot edit.

## The rule for this directory

Keep local changes **marked** and **small**, so upstream can still be diffed
against it. Anything substantial that is ours belongs in a file outside this
directory that imports from it.

Mark every local edit with a comment beginning `LOCAL:` and say why, e.g.

```ts
// LOCAL: the capture must skip our light canvases, which sit above all
// content and would otherwise be rasterised into the very scene they light.
```

The upstream README is kept beside this file as `UPSTREAM-README.md` for the
configuration reference.

## Upstream licence

```
MIT License

Copyright (c) Yassine Bouane

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other sources already drawn on in this repo

- `src/lib/bevel-map.ts` — rounded-rect SDF and circular height profile from
  this same library; Snell refraction from
  [jeantimex/glass-effect-webgpu](https://github.com/jeantimex/glass-effect-webgpu) (ISC).
