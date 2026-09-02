import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requireProject = createRequire(path.join(project, "package.json"));

// Compile the real application modules. Only browser-only widgets and network/OCR
// boundaries are replaced; React state, request scopes, validation, and parsers run.
export async function loadSource(entry, mocks = {}, environment = {}) {
  const source = entry.includes("export ") ? entry : `export * from ${JSON.stringify(path.join(project, entry))};`;
  const bundled = await build({ stdin: { contents: source, resolveDir: project, sourcefile: "regression-entry.jsx", loader: "jsx" },
    bundle: true, platform: "node", format: "cjs", packages: "external", jsx: "automatic", write: false,
    plugins: [{ name: "test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
        if (Object.hasOwn(mocks, specifier)) return { path: specifier, namespace: "test-mock" };
        if (/\.css$|pdf\.worker\.mjs\?url$/.test(specifier)) return { path: "empty", namespace: "test-empty" };
      });
      builder.onLoad({ filter: /.*/, namespace: "test-mock" }, ({ path: specifier }) => ({ contents: `module.exports = __testMocks[${JSON.stringify(specifier)}];`, loader: "js" }));
      builder.onLoad({ filter: /.*/, namespace: "test-empty" }, () => ({ contents: "export default '';", loader: "js" }));
    } }],
  });
  const module = { exports: {} };
  const names = Object.keys(environment);
  const execute = new Function("require", "module", "exports", "__testMocks", ...names, bundled.outputFiles[0].text);
  execute(requireProject, module, module.exports, mocks, ...names.map((name) => environment[name]));
  return module.exports;
}

export function memoryWindow(initial = {}) {
  const values = new Map(Object.entries(initial));
  const events = new EventTarget();
  return { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    setTimeout, clearTimeout, confirm: () => true,
  };
}

export function deferred() {
  let resolve; let reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

export const jsonReply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
