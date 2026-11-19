import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  image: vi.fn(),
  command: vi.fn(),
  labels: vi.fn(),
  network: vi.fn(),
  resources: vi.fn(),
  ulimits: vi.fn(),
}));
vi.mock("testcontainers", () => ({
  GenericContainer: class {
    constructor(image: string) {
      calls.image(image);
    }
    withNetworkMode = calls.network;
    withCommand = calls.command;
    withLabels = calls.labels;
    withResourcesQuota = calls.resources;
    withUlimits = calls.ulimits;
  },
}));

import { mongodbContainer } from "../testing/mongodb-container";

describe("integration MongoDB selection", () => {
  it("preserves the official CI image and defaults without overrides", () => {
    vi.clearAllMocks();
    mongodbContainer({});
    expect(calls.image).toHaveBeenCalledWith("mongo:7");
    expect(calls.command).toHaveBeenCalledWith(["mongod"]);
    expect(calls.labels).not.toHaveBeenCalled();
    expect(calls.network).not.toHaveBeenCalled();
    expect(calls.resources).not.toHaveBeenCalled();
    expect(calls.ulimits).not.toHaveBeenCalled();
  });

  it("labels only an explicitly owned test run for scoped cleanup", () => {
    vi.clearAllMocks();
    mongodbContainer({ BGO_TEST_MONGODB_OWNER: "owned-api-run" });
    expect(calls.labels).toHaveBeenCalledExactlyOnceWith({
      "com.board-game-organizer.test-owner": "owned-api-run",
    });
  });

  it("uses the Pi image, private network and bounded database resources", () => {
    vi.clearAllMocks();
    mongodbContainer({
      BGO_TEST_MONGODB_IMAGE: "local/mongo-pi4:7",
      BGO_TEST_DOCKER_NETWORK: "test-network",
    });
    expect(calls.image).toHaveBeenCalledWith("local/mongo-pi4:7");
    expect(calls.network).toHaveBeenCalledWith("test-network");
    expect(calls.resources).toHaveBeenCalledWith({ memory: 0.5, cpu: 1 });
    expect(calls.command).toHaveBeenCalledWith(["mongod", "--wiredTigerCacheSizeGB", "0.25"]);
    expect(calls.ulimits).toHaveBeenCalledWith({
      nofile: { soft: 64000, hard: 64000 },
    });
  });

  it.each([false, true])(
    "keeps replica-set startup and the cache bound together (Pi: %s)",
    (pi) => {
      vi.clearAllMocks();
      mongodbContainer(pi ? { BGO_TEST_MONGODB_IMAGE: "local/mongo-pi4:7" } : {}, {
        replicaSet: true,
      });
      expect(calls.command).toHaveBeenCalledExactlyOnceWith([
        "mongod",
        "--replSet",
        "rs0",
        "--bind_ip_all",
        ...(pi ? ["--wiredTigerCacheSizeGB", "0.25"] : []),
      ]);
    },
  );

  it("encodes 512 MiB in the installed SDK's Docker configuration", async () => {
    vi.clearAllMocks();
    mongodbContainer({ BGO_TEST_MONGODB_IMAGE: "local/mongo-pi4:7" });
    const { GenericContainer } =
      await vi.importActual<typeof import("testcontainers")>("testcontainers");
    // Constructing this SDK probe never starts a container or contacts Docker.
    class QuotaProbe extends GenericContainer {
      limits() {
        return {
          memoryBytes: this.hostConfig.Memory,
          nanoCpus: this.hostConfig.NanoCpus,
        };
      }
    }
    const [quota] = calls.resources.mock.calls[0];
    const probe = new QuotaProbe("mongo:7").withResourcesQuota(quota);
    expect(probe.limits()).toEqual({
      memoryBytes: 512 * 1024 * 1024,
      nanoCpus: 1_000_000_000,
    });
  });

  it("reads environment overrides when called by integration fixtures", () => {
    vi.stubEnv("BGO_TEST_MONGODB_IMAGE", "local/mongo-pi4:7");
    try {
      mongodbContainer();
      expect(calls.image).toHaveBeenLastCalledWith("local/mongo-pi4:7");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
