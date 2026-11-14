// Preserve the registry-only dependency boundary when changing package managers.
export const scanner = {
  version: "1",
  async scan({ packages }) {
    return packages
      .filter((pkg) => {
        try {
          const url = new URL(pkg.tarball);
          return (
            url.protocol !== "https:" ||
            url.hostname !== "registry.npmjs.org" ||
            url.username !== "" ||
            url.password !== "" ||
            !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(pkg.version)
          );
        } catch {
          return true;
        }
      })
      .map((pkg) => ({
        level: "fatal",
        package: pkg.name,
        url: null,
        description:
          "BGO dependencies must use HTTPS npm registry packages; review source changes explicitly.",
      }));
  },
};
