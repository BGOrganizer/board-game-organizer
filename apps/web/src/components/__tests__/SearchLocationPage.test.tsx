import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchLocationPage } from "@/components/SearchLocationPage";
import { renderWithI18n } from "@/test-utils";

vi.mock("mapbox-gl", () => ({
  default: {
    Map: class {
      remove() {}
      flyTo() {}
    },
    Marker: class {
      setLngLat() {
        return this;
      }
      addTo() {
        return this;
      }
      remove() {}
    },
  },
}));
const originalToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalToken === undefined) delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  else process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = originalToken;
});

it("requires a chosen address and four-character name, with five search results at most", async () => {
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "pk.test";
  const getToken = vi.fn().mockResolvedValue("fresh-session-token");
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: Array.from({ length: 6 }, (_, i) => ({
        id: `place.${i}`,
        address: `${i} Main St`,
        longitude: 12.5,
        latitude: 41.9,
      })),
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn();
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={getToken}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );
  const confirm = screen.getByRole("button", { name: "Confirm location" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "abc" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Search address" }), {
    target: { value: "Main St" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("list", { name: "Address results" }).querySelectorAll("li"),
    ).toHaveLength(5),
  );
  expect(getToken).toHaveBeenCalled();
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer fresh-session-token");
  fireEvent.click(screen.getByRole("button", { name: "0 Main St" }));
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Game cafe" },
  });
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Game cafe",
      address: "0 Main St",
      longitude: 12.5,
      latitude: 41.9,
    }),
  );
  expect(onSelect.mock.calls[0][0].id).toMatch(/^[a-f0-9-]{36}$/);
});

it("fails closed when Mapbox public token is missing", () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "token"}
      initial={{
        id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
        name: "Game cafe",
        address: "123 Main St",
        longitude: 12.5,
        latitude: 41.9,
      }}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("Map unavailable");
  expect(
    (screen.getByRole("button", { name: "Confirm location" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it("does not search short queries and reports upstream failures without pretending results are empty", async () => {
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "pk.test";
  const fetchMock = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetchMock);
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "token"}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Search address" }), {
    target: { value: "abc" },
  });
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Search address" }), {
    target: { value: "Rome" },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Could not search addresses"),
  );
  expect(
    (screen.getByRole("button", { name: "Confirm location" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
