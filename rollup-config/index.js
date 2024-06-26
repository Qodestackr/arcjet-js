import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isBuiltin } from "module";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";

function removeExtension(filename) {
  return path.basename(filename, path.extname(filename));
}

function isTypeScript(file) {
  return (
    file.isFile() && file.name.endsWith(".ts") && !file.name.endsWith(".d.ts")
  );
}

export function createConfig(root, { plugins = [] } = {}) {
  const packageJson = fileURLToPath(new URL("./package.json", root));
  const pkg = JSON.parse(fs.readFileSync(packageJson));
  const dependencies = Object.keys(pkg.dependencies ?? {});
  const devDependencies = Object.keys(pkg.devDependencies ?? {});
  const peerDependencies = Object.keys(pkg.peerDependencies ?? {});

  function isDependency(id) {
    return dependencies.some((dep) => id.startsWith(dep));
  }

  function isDevDependency(id) {
    return devDependencies.some((dep) => id.startsWith(dep));
  }

  function isPeerDependency(id) {
    return peerDependencies.some((dep) => id.startsWith(dep));
  }

  function isBunBuiltin(id) {
    return id === "bun";
  }

  function isSvelteKitBuiltin(id) {
    return id === "$env/dynamic/private";
  }

  const rootDir = fileURLToPath(new URL(".", root));
  const testDir = fileURLToPath(new URL("test/", root));

  const typescriptDirs = [rootDir, testDir];

  // Creates a Rollup input entry that can be used with `Object.fromEntries()`
  function toEntry(file) {
    return [
      path.relative(rootDir, `${file.path}${removeExtension(file.name)}`),
      path.relative(rootDir, `${file.path}${file.name}`),
    ];
  }

  // Find all TypeScript files in the specified directories
  const input = Object.fromEntries(
    typescriptDirs.flatMap((dir) => {
      // All the directories might not exist in every project
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        return files.filter(isTypeScript).map(toEntry);
      } catch (err) {
        return [];
      }
    }),
  );

  return {
    input,
    output: {
      dir: ".",
      format: "es",
      // Hoist transitive imports for faster loading. For more details, see
      // https://rollupjs.org/faqs/#why-do-additional-imports-turn-up-in-my-entry-chunks-when-code-splitting
      hoistTransitiveImports: true,
      // Stop rollup from creating additional chunks that it thinks we need
      preserveModules: true,
    },
    external(id) {
      return (
        isBuiltin(id) ||
        isDependency(id) ||
        isDevDependency(id) ||
        isPeerDependency(id) ||
        isBunBuiltin(id) ||
        isSvelteKitBuiltin(id)
      );
    },
    plugins: [
      // Replace always comes first to ensure the replaced values exist for all
      // other plugins
      replace({
        values: {
          // We always replace `__ARCJET_SDK_VERSION__` based on the version
          // in package.json
          __ARCJET_SDK_VERSION__: pkg.version,
        },
        preventAssignment: true,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        // Override the `excludes` specified in the tsconfig so we don't
        // generate definition files for our tests
        exclude: ["node_modules", "test/*.ts"],
        declaration: true,
        declarationDir: ".",
        noEmitOnError: true,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        // Override the `includes` specified in the tsconfig so we don't
        // generate definition files for our tests
        include: "test/*.ts",
        noEmitOnError: true,
      }),
      {
        name: "externalize-wasm",
        resolveId(id) {
          // Vercel uses the `.wasm?module` suffix to make WebAssembly available
          // in their Vercel Functions product.
          // https://vercel.com/docs/functions/wasm#using-a-webassembly-file
          //
          // The Cloudflare docs say they support the `.wasm?module` suffix, but
          // that seems to no longer be the case with Wrangler 2 so we need to
          // have separate imports for just the `.wasm` files.
          //
          // https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/#bundling
          if (id.endsWith(".wasm") || id.endsWith(".wasm?module")) {
            return { id, external: true };
          }
          return null;
        },
      },
      ...plugins,
    ],
  };
}
