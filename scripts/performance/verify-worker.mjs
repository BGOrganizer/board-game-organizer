// Vitest forwards profiling flags only when its worker execArgv is explicit.
if (typeof globalThis.gc !== "function")
  throw new Error("Reassure worker requires the actual Node garbage collector (--expose-gc)");
for (const argument of [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
])
  if (!process.execArgv.includes(argument))
    throw new Error(`Reassure worker is missing ${argument}`);
