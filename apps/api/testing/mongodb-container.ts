import { GenericContainer } from "testcontainers";

export function mongodbContainer(
  env: Record<string, string | undefined> = process.env,
  { replicaSet = false }: { replicaSet?: boolean } = {},
) {
  const container = new GenericContainer(env.BGO_TEST_MONGODB_IMAGE || "mongo:7");
  if (env.BGO_TEST_MONGODB_OWNER)
    container.withLabels({
      "com.board-game-organizer.test-owner": env.BGO_TEST_MONGODB_OWNER,
    });
  container.withCommand([
    "mongod",
    ...(replicaSet ? ["--replSet", "rs0", "--bind_ip_all"] : []),
    // A Pi kernel may disable memory cgroups, so also bound WiredTiger itself.
    ...(env.BGO_TEST_MONGODB_IMAGE ? ["--wiredTigerCacheSizeGB", "0.25"] : []),
  ]);
  if (env.BGO_TEST_DOCKER_NETWORK) container.withNetworkMode(env.BGO_TEST_DOCKER_NETWORK);
  // Bound the Pi's custom test database without changing the existing CI defaults.
  if (env.BGO_TEST_MONGODB_IMAGE) {
    // Testcontainers memory quotas are expressed in GiB, not bytes.
    container.withResourcesQuota({ memory: 0.5, cpu: 1 });
    // MongoDB's recommended limit prevents WiredTiger exhaustion across fixture databases.
    container.withUlimits({ nofile: { soft: 64000, hard: 64000 } });
  }
  return container;
}
