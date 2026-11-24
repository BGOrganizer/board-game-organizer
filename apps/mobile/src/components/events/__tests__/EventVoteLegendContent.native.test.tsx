import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventVoteLegendContent } from "../EventVoteLegendContent";

it.each(["only", "mixed"] as const)(
  "clarifies repeat voting for a %s modified option without changing the eligibility rules",
  async (singleOption) => {
    const positive = "For a category with several options, choose at least one Yes or If needed.";
    await render(
      <NativeTestProviders>
        <EventVoteLegendContent scope="event" multipleCategories singleOption={singleOption} />
      </NativeTestProviders>,
    );
    expect(screen.getByText("Yes")).toBeVisible();
    expect(screen.getByText("If needed")).toBeVisible();
    expect(screen.getByText("No")).toBeVisible();
    expect(
      screen.getByText(
        "You can vote only if you are an accepted participant in at least one table in the event.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Vote again on the changed option. A No keeps you registered and blocks agreement if you have a seat.",
      ),
    ).toBeVisible();
    if (singleOption === "mixed") expect(screen.getByText(positive)).toBeVisible();
    else expect(screen.queryByText(positive)).toBeNull();
  },
);
