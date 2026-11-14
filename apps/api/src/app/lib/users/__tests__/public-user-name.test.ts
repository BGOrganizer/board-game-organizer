import { expect, it } from "vitest";
import { publicUserName } from "../public-user-name";

it("never uses mirrored email as a public identity", () => {
  expect(publicUserName({ name: "Name", email: "email", username: "user" })).toBe("Name");
  expect(publicUserName({ name: "email", email: "email", username: "user" })).toBe("user");
  expect(publicUserName({ name: null, email: "email", username: null }, "fallback")).toBe(
    "fallback",
  );
  expect(publicUserName(null)).toBe("");
  expect(publicUserName(undefined, "fallback")).toBe("fallback");
});
