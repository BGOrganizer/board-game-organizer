import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { LeaderboardGameCover } from "../LeaderboardGameCover";

it("shows the selected game's real cover and switches to the catalog fallback when the selection clears", async () => {
  const cover = "https://images.fixture.test/game-cover.png";
  const view = await render(<LeaderboardGameCover imageUrl={cover} />, {
    wrapper: NativeTestProviders,
  });
  const images = () => screen.container.queryAll((node) => node.type === "RCTImageView");
  expect(images()).toHaveLength(1);
  expect(images()[0]).toHaveProp("source", [expect.objectContaining({ uri: cover })]);
  expect(images()[0]).toHaveStyle({ width: 20, height: 24 });
  expect(screen.queryByRole("image")).toBeNull();

  await view.rerender(<LeaderboardGameCover imageUrl={null} />);
  expect(images()).toHaveLength(0);
  const fallback = screen.container.queryAll(
    (node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 16,
  );
  expect(fallback).toHaveLength(1);
});
