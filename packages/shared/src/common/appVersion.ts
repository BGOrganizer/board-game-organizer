/** Public build identity belongs to the running JavaScript bundle, including OTA updates. */
export function appVersion(version: string, prerelease: boolean, revision?: string) {
  if (!prerelease || !revision || !/^[a-f0-9]{40}$/i.test(revision)) return version;
  return `${version}${version.includes("+") ? "." : "+"}${revision.slice(0, 7).toLowerCase()}`;
}
