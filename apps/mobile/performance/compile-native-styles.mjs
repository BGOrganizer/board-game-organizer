import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function sourceTreeDigest(directory) {
  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(relative(directory, file));
    digest.update("\0");
    digest.update(await readFile(file));
    digest.update("\0");
  }
  return { files: files.length, sha256: digest.digest("hex") };
}

/** Run once before native workers; compile the application's actual CSS, never a test palette. */
export async function compileNativeStyles(appRoot = fileURLToPath(new URL("..", import.meta.url))) {
  appRoot = resolve(appRoot);
  const previousDirectory = process.cwd();
  const outputDirectory = join(appRoot, ".reassure");
  const artifact = join(outputDirectory, "native-styles.cjs");
  const temporaryArtifact = `${artifact}.${process.pid}.tmp`;
  const require = createRequire(join(appRoot, "package.json"));
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  try {
    process.chdir(appRoot);
    const metroConfigFile = join(appRoot, "metro.config.js");
    const metro = require(metroConfigFile);
    if (!metro.transformer?.uniwind || !metro.transformerPath) {
      throw new Error("The application Metro config must include withUniwindConfig");
    }
    const options = {
      platform: "android",
      type: "module",
      dev: true,
      minify: false,
      inlinePlatform: true,
      inlineRequires: false,
      experimentalImportSupport: false,
      unstable_transformProfile: "default",
      customTransformOptions: {},
    };
    const transformerConfig = {
      ...metro.transformer,
      unstable_disableModuleWrapping: true,
      uniwind: {
        ...metro.transformer.uniwind,
        dtsFile: join(outputDirectory, "native-styles.d.ts"),
      },
    };
    const cssFile = join(appRoot, metro.transformer.uniwind.cssEntryFile);
    const css = await readFile(cssFile);
    const { transform } = require(metro.transformerPath);
    const result = await transform(
      transformerConfig,
      appRoot,
      relative(appRoot, cssFile),
      css,
      options,
    );
    const code = result.output.find((output) => output.type === "js/module")?.data.code;
    if (
      typeof code !== "string" ||
      !/require\(['"]uniwind['"]\)/.test(code) ||
      !code.includes(".__reinit(") ||
      /\b__d\s*\(|\b_dependencyMap\b/.test(code)
    ) {
      throw new Error("Metro did not emit a standalone native Uniwind registration module");
    }
    const versions = {};
    const compilerRequire = createRequire(metro.transformerPath);
    for (const name of [
      "uniwind",
      "heroui-native",
      "tailwindcss",
      "@tailwindcss/node",
      "@expo/metro-config",
      "metro-transform-worker",
    ]) {
      const resolver = ["heroui-native", "tailwindcss"].includes(name) ? require : compilerRequire;
      // Tailwind's Node compiler does not export its package.json subpath.
      const manifest =
        name === "@tailwindcss/node"
          ? join(dirname(resolver.resolve(name)), "../package.json")
          : resolver.resolve(`${name}/package.json`);
      versions[name] = JSON.parse(await readFile(manifest)).version;
    }
    const metadata = {
      platform: options.platform,
      generatedAt: new Date().toISOString(),
      appRoot,
      versions,
      inputs: {
        css: { path: relative(appRoot, cssFile), sha256: sha256(css) },
        metroConfigSha256: sha256(await readFile(metroConfigFile)),
        lockfileSha256: sha256(await readFile(join(appRoot, "../../bun.lock"))),
        applicationSources: await sourceTreeDigest(join(appRoot, "src")),
        heroUiSources: await sourceTreeDigest(
          join(dirname(require.resolve("heroui-native/package.json")), "lib"),
        ),
      },
      transformer: {
        path: relative(appRoot, metro.transformerPath),
        cssEntryFile: metro.transformer.uniwind.cssEntryFile,
        extraThemes: metro.transformer.uniwind.extraThemes ?? [],
        polyfills: metro.transformer.uniwind.polyfills ?? {},
        options,
      },
      artifact: { file: "native-styles.cjs", sha256: sha256(code) },
    };
    await writeFile(temporaryArtifact, code, { mode: 0o600 });
    await rename(temporaryArtifact, artifact);
    await writeFile(
      join(outputDirectory, "native-styles.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    return artifact;
  } finally {
    process.chdir(previousDirectory);
    await rm(temporaryArtifact, { force: true });
  }
}
