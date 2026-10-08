import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventWizard } from "@/components/EventWizard";
import { OrganizationWizard } from "@/components/OrganizationWizard";
import { renderWithI18n as renderI18n } from "@/test-utils";

function renderWithI18n(element: ReactElement) {
  return renderI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {element}
    </QueryClientProvider>,
  );
}

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn() };
const id = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222",
  assetId = "33333333-3333-4333-8333-333333333333";
const location = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Club house",
  address: "Via Roma 1, Italy",
  latitude: 45,
  longitude: 12,
};
const organization = {
  id,
  name: "Community club",
  role: "admin",
  approvalStatus: "APPROVED",
  location,
  logoAssetId: assetId,
  version: 4,
};
const event = {
  id,
  organizationId: id,
  name: "Annual games night",
  location,
  role: "admin",
  status: "PUBLISHED",
  version: 7,
  startsAt: "2030-01-01T18:00:12.000Z",
  endsAt: "2030-01-01T22:00:34.000Z",
  bookingClosesAt: "2029-12-31T18:00:56.000Z",
  timeZone: "UTC",
  canModify: true,
  tableCount: 3,
};
const table = {
  id: tableId,
  eventId: id,
  name: "Azul table",
  gameId: 1,
  gameName: "Azul",
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  minPlayers: 2,
  maxPlayers: 4,
  status: "PLANNING",
  openSkill: false,
  demonstratorUserId: null,
};
let open = true;
const useEventMock = vi.fn(),
  useOrganizationMock = vi.fn(),
  useTablesMock = vi.fn();
const eventActions = {
  create: { mutateAsync: vi.fn() },
  update: { mutateAsync: vi.fn() },
  busy: false,
};
const organizationActions = {
  create: { mutateAsync: vi.fn() },
  update: { mutateAsync: vi.fn() },
  busy: false,
};
const upload = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.example.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh-token"),
  }),
}));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useEvent: (...args: unknown[]) => useEventMock(...args),
  useOrganization: (...args: unknown[]) => useOrganizationMock(...args),
  useEventTables: () => useTablesMock(),
  useEventActions: () => eventActions,
  useOrganizationActions: () => organizationActions,
  useEventWindow: () => open,
  useFavoriteLocations: () => ({ cacheKnown: vi.fn() }),
  useOrganizationLogo: () => ({ data: "data:image/webp;base64,AQID", isPending: false }),
  useOrganizations: () => ({
    items: [organization],
    isPending: false,
    isError: false,
    hasNextPage: false,
  }),
  useOrganizationMembers: () => ({
    items: [],
    isPending: false,
    isError: false,
    hasNextPage: false,
  }),
  uploadOrganizationLogo: (...args: unknown[]) => upload(...args),
}));
vi.mock("@/components/SearchLocationPage", () => ({
  SearchLocationPage: ({
    onSelect,
    onClose,
  }: {
    onSelect: (x: typeof location) => void;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSelect(location)}>
        Use verified address
      </button>
      <button type="button" onClick={onClose}>
        Close location picker
      </button>
    </div>
  ),
}));
vi.mock("@/components/SearchGamePage", () => ({
  SearchGamePage: ({
    onSelect,
    onClose,
  }: {
    onSelect: (x: { id: number; name: string; image: null }) => void;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSelect({ id: 1, name: "Azul", image: null })}>
        Pick Azul
      </button>
      <button type="button" onClick={onClose}>
        Close game picker
      </button>
    </div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  open = true;
  useEventMock.mockReturnValue({ data: undefined, isPending: false, isError: false });
  useOrganizationMock.mockImplementation(
    (options: { enabled?: boolean }, organizationId: string) => ({
      data: options.enabled !== false && organizationId ? organization : undefined,
      isPending: false,
      isError: false,
    }),
  );
  useTablesMock.mockReturnValue({
    items: [],
    isPending: false,
    isError: false,
    hasNextPage: false,
  });
  eventActions.create.mutateAsync.mockResolvedValue(event);
  eventActions.update.mutateAsync.mockResolvedValue(event);
  organizationActions.create.mutateAsync.mockResolvedValue(organization);
  organizationActions.update.mutateAsync.mockResolvedValue(organization);
  upload.mockResolvedValue({ id: assetId });
});
function enterInfo() {
  fireEvent.change(screen.getByLabelText("Event name"), {
    target: { value: "Summer games evening" },
  });
  fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "UTC" } });
  fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2030-01-01T18:00" } });
  fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2030-01-01T22:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Choose.*address|Choose.*location/i }));
  fireEvent.click(screen.getByRole("button", { name: "Use verified address" }));
}
function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
describe("event wizard acceptance", () => {
  it("creates a draft through information, table and review with default 24-hour cutoff and explicit seats", async () => {
    renderWithI18n(<EventWizard organizationId={id} />);
    enterInfo();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Add table" }));
    fireEvent.change(screen.getByLabelText("Table name"), { target: { value: "Azul table" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick Azul" }));
    fireEvent.click(screen.getByRole("button", { name: "Save table" }));
    expect(screen.getByRole("button", { name: "Edit table: Azul table" })).not.toBeNull();
    next();
    expect(screen.getByText("Review event")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(eventActions.create.mutateAsync).toHaveBeenCalledWith({
        organizationId: id,
        input: expect.objectContaining({
          name: "Summer games evening",
          status: "DRAFT",
          location,
          bookingClosesAt: "2029-12-31T18:00:00.000Z",
          tables: [
            expect.objectContaining({
              name: "Azul table",
              gameId: 1,
              minPlayers: 2,
              openSkill: false,
            }),
          ],
        }),
      }),
    );
    expect(router.replace).toHaveBeenCalledWith(`/events/${id}`);
  });
  it("retains unloaded tables and stored seconds on a non-destructive partial edit", async () => {
    useEventMock.mockReturnValue({ data: event, isPending: false, isError: false });
    useTablesMock.mockReturnValue({
      items: [table],
      isPending: false,
      isError: false,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
    });
    renderWithI18n(<EventWizard eventId={id} />);
    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Renamed games evening" },
    });
    next();
    expect(
      screen.getByText("Unloaded tables are retained. Only explicit removals delete tables."),
    ).not.toBeNull();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(eventActions.update.mutateAsync).toHaveBeenCalledWith({
        id,
        input: expect.objectContaining({
          name: "Renamed games evening",
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          bookingClosesAt: event.bookingClosesAt,
          version: 7,
          tables: [],
          removedTableIds: [],
        }),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("confirms destructive table removal only on final submission and preserves edits after failure", async () => {
    useEventMock.mockReturnValue({ data: event, isPending: false, isError: false });
    useTablesMock.mockReturnValue({
      items: [table],
      isPending: false,
      isError: false,
      hasNextPage: false,
    });
    eventActions.update.mutateAsync.mockRejectedValueOnce(new Error("EVENT_CHANGED"));
    renderWithI18n(<EventWizard eventId={id} />);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Remove table: Azul table" }));
    expect(eventActions.update.mutateAsync).not.toHaveBeenCalled();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(eventActions.update.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Reset reservations" })).getByRole("button", {
        name: "Save changes",
      }),
    );
    await waitFor(() =>
      expect(eventActions.update.mutateAsync).toHaveBeenCalledWith({
        id,
        input: expect.objectContaining({ version: 7, tables: [], removedTableIds: [tableId] }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not save event"),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("blocks the wizard at cutoff and rejects visitors before exposing edit controls", () => {
    useEventMock.mockReturnValue({ data: event, isPending: false, isError: false });
    open = false;
    const rendered = renderWithI18n(<EventWizard eventId={id} />);
    expect(screen.getByText("Bookings are closed. Results can still be recorded.")).not.toBeNull();
    expect(screen.queryByLabelText("Event name")).toBeNull();
    rendered.unmount();
    useEventMock.mockReturnValue({
      data: { ...event, role: "visitor" },
      isPending: false,
      isError: false,
    });
    renderWithI18n(<EventWizard eventId={id} />);
    expect(screen.getByText("Event cannot be edited")).not.toBeNull();
  });
  it("rejects incomplete information and invalid time zones before sending changes", () => {
    renderWithI18n(<EventWizard organizationId={id} />);
    next();
    expect(screen.getByRole("alert").textContent).toContain("Check event name");
    expect(screen.queryByRole("button", { name: "Add table" })).toBeNull();
    enterInfo();
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Invalid/Zone" } });
    next();
    expect(eventActions.create.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Check event name");
  });
});
describe("organization wizard acceptance", () => {
  it("keeps a mandatory verified logo/address, rejects unsupported media and submits after bounded upload", async () => {
    renderWithI18n(<OrganizationWizard />);
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(organizationActions.create.mutateAsync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Community club" },
    });
    fireEvent.change(screen.getByLabelText("Organization logo"), {
      target: {
        files: [new File([new Uint8Array([1])], "document.pdf", { type: "application/pdf" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not upload logo"),
    );
    expect(upload).not.toHaveBeenCalled();
    const file = new File([new Uint8Array([1, 2, 3])], "logo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    fireEvent.change(screen.getByLabelText("Organization logo"), { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Choose.*address|Choose.*location/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use verified address" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(organizationActions.create.mutateAsync).toHaveBeenCalledWith({
        name: "Community club",
        logoAssetId: assetId,
        location,
      }),
    );
    expect(router.replace).toHaveBeenCalledWith(`/organizations/${id}`);
  });
  it("version-checks modifications, retains the current logo and keeps failed drafts visible", async () => {
    organizationActions.update.mutateAsync.mockRejectedValueOnce(new Error("ORGANIZATION_CHANGED"));
    renderWithI18n(<OrganizationWizard organizationId={id} />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "New community name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(organizationActions.update.mutateAsync).toHaveBeenCalledWith({
        id,
        input: { name: "New community name", logoAssetId: assetId, location, version: 4 },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not save organization"),
    );
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe(
      "New community name",
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
