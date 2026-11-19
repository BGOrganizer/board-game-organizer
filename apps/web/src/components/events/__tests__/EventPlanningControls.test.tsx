import { eventDraft, useEventRecordForm } from "@board-game-organizer/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { GroupVisibilityPicker } from "@/components/groups/GroupVisibilityPicker";
import { renderWithI18n } from "@/test-utils";
import { EventPlanningSettings } from "../EventPlanningSettings";
import { EventVisibilityPicker } from "../EventVisibilityPicker";

it.each([
  { locked: false, busy: false, publicAllowed: false },
  { locked: true, busy: false, publicAllowed: true },
  { locked: false, busy: true, publicAllowed: true },
])("blocks unauthorized or unavailable public visibility: %j", (state) => {
  const onChange = vi.fn();
  renderWithI18n(<EventVisibilityPicker value="PRIVATE" onChange={onChange} {...state} />);
  const publicChoice = screen.getByRole("radio", { name: "Public" });
  expect(publicChoice.hasAttribute("disabled")).toBe(true);
  fireEvent.click(publicChoice);
  expect(onChange).not.toHaveBeenCalled();
  if (state.locked) {
    expect(screen.getByText("Event visibility cannot be changed after creation.")).toBeTruthy();
  } else if (!state.publicAllowed) {
    expect(
      screen.getByText("Select an approved public group to enable public events."),
    ).toBeTruthy();
  }
});

function PublicEventSelection() {
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  return (
    <EventVisibilityPicker
      value={visibility}
      onChange={setVisibility}
      publicAllowed
      locked={false}
      busy={false}
    />
  );
}

it("changes an eligible new event between public and private without exposing unavailable text", () => {
  renderWithI18n(<PublicEventSelection />);
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  expect((screen.getByRole("radio", { name: "Public" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect((screen.getByRole("radio", { name: "Private" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByText("Select an approved public group to enable public events.")).toBeNull();
});

function GroupSelection() {
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  return <GroupVisibilityPicker value={visibility} onChange={setVisibility} disabled={false} />;
}

it("keeps a group's real controlled selection updated across both choices", () => {
  renderWithI18n(<GroupSelection />);
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  expect((screen.getByRole("radio", { name: "Public" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect((screen.getByRole("radio", { name: "Private" }) as HTMLInputElement).checked).toBe(true);
});

const disabledApi = {
  apiUrl: "https://api.test.invalid",
  userId: "owner",
  getToken: async () => null,
  enabled: false,
};

function PlanningSettings({ busy = false }: { busy?: boolean }) {
  const form = useEventRecordForm(disabledApi, undefined, undefined, {
    ...eventDraft(undefined),
    planningMode: "MANUAL",
    playerPreference: "MORE_PLAYERS",
    allowBestReduction: false,
  });
  return (
    <>
      <EventPlanningSettings form={form} busy={busy} />
      <output aria-label="Planning selection">
        {form.draft.planningMode}/{form.draft.playerPreference}/
        {String(form.draft.allowBestReduction)}
      </output>
    </>
  );
}

it("requires explicit consent before switching to assistance and preserves manual mode on cancel", async () => {
  renderWithI18n(<PlanningSettings />);
  fireEvent.click(screen.getByRole("radio", { name: "Assisted" }));
  const confirmation = await screen.findByRole("dialog", { name: "Assisted" });
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/MORE_PLAYERS/false");
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/MORE_PLAYERS/false");
  fireEvent.click(screen.getByRole("radio", { name: "Assisted" }));
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Assisted" })).getByRole("button", {
      name: "Assisted",
    }),
  );
  expect(screen.getByLabelText("Planning selection").textContent).toBe(
    "ASSISTED/MORE_PLAYERS/false",
  );
  fireEvent.click(screen.getByRole("radio", { name: "Manual" }));
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/MORE_PLAYERS/false");
});

it("updates BGG Best and player preference through the actual form's patch behavior", () => {
  renderWithI18n(<PlanningSettings />);
  fireEvent.click(screen.getByRole("radio", { name: "BGG Best" }));
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/BEST/true");
  fireEvent.click(screen.getByRole("radio", { name: "Players" }));
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/MORE_PLAYERS/false");
});

it("disables every planning choice while a write is pending", () => {
  renderWithI18n(<PlanningSettings busy />);
  for (const choice of screen.getAllByRole("radio")) {
    expect(choice.hasAttribute("disabled")).toBe(true);
    fireEvent.click(choice);
  }
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Planning selection").textContent).toBe("MANUAL/MORE_PLAYERS/false");
});
