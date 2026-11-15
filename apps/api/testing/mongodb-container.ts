import { GenericContainer } from "testcontainers";

export function mongodbContainer(env: Record<string, string | undefined> = process.env) {
  const container = new GenericContainer(env.BGO_TEST_MONGODB_IMAGE || "mongo:7");
  if (env.BGO_TEST_DOCKER_NETWORK) container.withNetworkMode(env.BGO_TEST_DOCKER_NETWORK);
  // Bound the Pi's custom test database without changing the existing CI defaults.
  if (env.BGO_TEST_MONGODB_IMAGE) {
    container.withResourcesQuota({ memory: 512 * 1024 * 1024, cpu: 1 });
    // MongoDB's recommended limit prevents WiredTiger exhaustion across fixture databases.
    container.withUlimits({ nofile: { soft: 64000, hard: 64000 } });
  }
  return container;
}
