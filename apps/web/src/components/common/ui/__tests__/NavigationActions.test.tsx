import { Tabs } from "@heroui/react";
import { fireEvent, screen } from "@testing-library/react";
import { Info, UsersRound } from "lucide-react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { renderWithI18n } from "@/test-utils";
import { InfoSection } from "../InfoSection";
import { InvitationActions } from "../InvitationActions";
import { LinkedListCard } from "../LinkedListCard";
import { SearchHelpLabel } from "../SearchHelpLabel";
import { TabBar } from "../TabBar";
import { TabTrigger } from "../TabTrigger";

it.each([false, true])(
  "keeps invitation decisions explicit and blocks pending actions=%s",
  (pending) => {
    const accept = vi.fn(),
      decline = vi.fn();
    renderWithI18n(<InvitationActions pending={pending} onAccept={accept} onDecline={decline} />);
    const acceptButton = screen.getByRole("button", { name: "Accept invitation" });
    const declineButton = screen.getByRole("button", { name: "Decline invitation" });
    expect(acceptButton.hasAttribute("disabled")).toBe(pending);
    expect(declineButton.hasAttribute("disabled")).toBe(pending);
    fireEvent.click(acceptButton);
    fireEvent.click(declineButton);
    expect(accept).toHaveBeenCalledTimes(pending ? 0 : 1);
    expect(decline).toHaveBeenCalledTimes(pending ? 0 : 1);
  },
);

it.each(["cover", "thumbnail"] as const)(
  "keeps %s card navigation separate from informational controls",
  (artworkLayout) => {
    const opened = vi.fn(),
      control = vi.fn();
    const view = renderWithI18n(
      <LinkedListCard
        href="#resource"
        label="Open resource"
        onOpen={opened}
        notificationCount={2}
        artwork={<span>Artwork</span>}
        artworkLayout={artworkLayout}
        heading={<h2>Resource</h2>}
        leadingActions={
          <button type="button" onClick={control}>
            Visibility
          </button>
        }
      >
        <p>Private resource</p>
      </LinkedListCard>,
    );
    const link = screen.getByRole("link", { name: "Open resource" });
    expect(link.getAttribute("aria-description")).toBe("Unread updates");
    fireEvent.click(screen.getByRole("button", { name: "Visibility" }));
    expect(control).toHaveBeenCalledOnce();
    expect(opened).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(opened).toHaveBeenCalledOnce();
    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      fireEvent.click(link, { [modifier]: true });
    }
    expect(opened).toHaveBeenCalledOnce();
    view.rerender(
      <LinkedListCard
        href="#resource"
        label="Open resource"
        disabled
        controlsDisabled
        artwork={null}
        artworkLayout={artworkLayout}
        actions={
          <button type="button" onClick={control}>
            Visibility
          </button>
        }
      >
        <p>Saving resource</p>
      </LinkedListCard>,
    );
    const disabledLink = screen.getByRole("link", { name: "Open resource" });
    expect(disabledLink.getAttribute("aria-disabled")).toBe("true");
    expect(disabledLink.tabIndex).toBe(-1);
    expect(fireEvent.click(disabledLink)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Visibility" }));
    expect(control).toHaveBeenCalledOnce();
  },
);

it("supports a card without controls or an open callback", () => {
  renderWithI18n(
    <LinkedListCard href="#plain" label="Open plain resource" artwork={null}>
      <p>Plain resource</p>
    </LinkedListCard>,
  );
  const link = screen.getByRole("link", { name: "Open plain resource" });
  expect(link.getAttribute("aria-description")).toBeNull();
  expect(link.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(link);
  expect(screen.getByText("Plain resource")).toBeTruthy();
});

it("portals route-owned actions only when the header target exists and removes them on unmount", () => {
  const absent = renderWithI18n(
    <HeaderActions>
      <button type="button">Absent action</button>
    </HeaderActions>,
  );
  expect(screen.queryByRole("button", { name: "Absent action" })).toBeNull();
  absent.unmount();
  const target = document.createElement("div");
  target.id = "page-header-actions";
  document.body.append(target);
  try {
    const press = vi.fn();
    const view = renderWithI18n(
      <HeaderActions>
        <button type="button" onClick={press}>
          Edit event
        </button>
      </HeaderActions>,
    );
    const action = screen.getByRole("button", { name: "Edit event" });
    expect(target.contains(action)).toBe(true);
    fireEvent.click(action);
    expect(press).toHaveBeenCalledOnce();
    view.unmount();
    expect(target.textContent).toBe("");
  } finally {
    target.remove();
  }
});

it.each([false, true])(
  "opens associated search help and preserves its input label, required=%s",
  async (required) => {
    renderWithI18n(
      <>
        <SearchHelpLabel
          label="Filter resources"
          htmlFor="resource-filter"
          help="Enter any part of the resource name."
          helpTitle="Filter instructions"
          required={required}
        />
        <input id="resource-filter" />
      </>,
    );
    expect(
      screen.getByLabelText(required ? "Filter resources *" : "Filter resources"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter resources: Filter instructions" }));
    expect(await screen.findByText("Enter any part of the resource name.")).toBeTruthy();
  },
);

it.each([false, true])(
  "renders section help with an optional independent header action=%s",
  async (accessory) => {
    renderWithI18n(
      <InfoSection
        label="Places"
        helpLabel="Places information"
        help="Choose a place for this event."
        icon={Info}
        headerAccessory={accessory ? <button type="button">Add place</button> : undefined}
      >
        <li>Community centre</li>
      </InfoSection>,
    );
    expect(screen.getByRole("region", { name: "Places" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Places" })).toBeTruthy();
    expect(Boolean(screen.queryByRole("button", { name: "Add place" }))).toBe(accessory);
    fireEvent.click(screen.getByRole("button", { name: "Places information" }));
    expect(await screen.findByText("Choose a place for this event.")).toBeTruthy();
  },
);

function DetailTabs() {
  const [selected, setSelected] = useState("details");
  return (
    <Tabs selectedKey={selected} onSelectionChange={(key) => setSelected(String(key))}>
      <TabBar label="Group sections">
        <TabTrigger id="details" icon={Info}>
          Details
        </TabTrigger>
        <TabTrigger id="members" icon={UsersRound} className="owned-members">
          {({ isSelected }) => (isSelected ? "Selected members" : "Members")}
        </TabTrigger>
      </TabBar>
      <Tabs.Panel id="details">Group details</Tabs.Panel>
      <Tabs.Panel id="members">Group members</Tabs.Panel>
    </Tabs>
  );
}

it("changes real HeroUI tabs using both static and render-prop trigger labels", () => {
  renderWithI18n(<DetailTabs />);
  const details = screen.getByRole("tab", { name: "Details" });
  expect(details.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  expect(screen.getByRole("tab", { name: "Selected members" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.getByText("Group members")).toBeTruthy();
  fireEvent.click(details);
  expect(screen.getByRole("tab", { name: "Members" }).getAttribute("aria-selected")).toBe("false");
  expect(screen.getByText("Group details")).toBeTruthy();
});
