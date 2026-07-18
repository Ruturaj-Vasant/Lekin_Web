# lekin-web

Browser-based scheduling research workbench built on `lekinpy`.

Live application: [ruturaj-vasant.github.io/Lekin_Web](https://ruturaj-vasant.github.io/Lekin_Web/)

## Current milestone

The browser MVP supports problem editing, built-in and custom Python algorithm
execution, Gantt inspection and manual editing, algorithm comparison, local
persistence, import and export, validation, and schedule performance metrics.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The GitHub Pages workflow builds a separate static export with the repository
path prefix. The regular `npm run build` remains the Worker-compatible build.

See [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [lekin-web_DECISIONS.md](./lekin-web_DECISIONS.md) for the product and engineering contracts.
