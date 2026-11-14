import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../../messages/it.js";
import { UserRoleBadge } from "../UserRoleBadge";

it.each(["en", "it"] as const)(
  "translates every independent role without showing raw shared message IDs (%s)",
  async (locale) => {
    const labels =
      locale === "it"
        ? [
            "Moderatore",
            "Dimostratore",
            "Partecipante con invito pendente",
            "Partecipante in lista d'attesa",
            "Partecipante accettato",
          ]
        : [
            "Moderator",
            "Demonstrator",
            "Participant with pending invitation",
            "Participant on the waiting list",
            "Accepted participant",
          ];
    renderWithI18n(
      <I18nProvider i18n={setupI18n({ locale, messages: { en, it: itMessages } })}>
        <UserRoleBadge
          roles={[
            "moderator",
            "demonstrator",
            "invitedParticipant",
            "waitingParticipant",
            "acceptedParticipant",
          ]}
        />
      </I18nProvider>,
    );
    const trigger = screen.getByRole("button", { name: labels.join(" · ") });
    expect(trigger.querySelector(".lucide-plus")).not.toBeNull();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    for (const label of labels) expect(within(dialog).getByText(label)).toBeTruthy();
    expect(dialog.querySelectorAll("li svg.size-4")).toHaveLength(5);
  },
);
