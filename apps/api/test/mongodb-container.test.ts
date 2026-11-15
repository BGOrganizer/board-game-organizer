import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  image: vi.fn(),
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
    expect(calls.network).not.toHaveBeenCalled();
    expect(calls.resources).not.toHaveBeenCalled();
    expect(calls.ulimits).not.toHaveBeenCalled();
  });

  it("uses the Pi image, private network and bounded database resources", () => {
    vi.clearAllMocks();
    mongodbContainer({
      BGO_TEST_MONGODB_IMAGE: "local/mongo-pi4:7",
      BGO_TEST_DOCKER_NETWORK: "test-network",
    });
    expect(calls.image).toHaveBeenCalledWith("local/mongo-pi4:7");
    expect(calls.network).toHaveBeenCalledWith("test-network");
    expect(calls.resources).toHaveBeenCalledWith({ memory: 536870912, cpu: 1 });
    expect(calls.ulimits).toHaveBeenCalledWith({ nofile: { soft: 64000, hard: 64000 } });
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
