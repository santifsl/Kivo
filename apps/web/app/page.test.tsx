import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@kivo/shared";
import Home from "./page";

describe("home page", () => {
  it("shows APP_NAME", () => {
    expect(renderToStaticMarkup(<Home />)).toContain(APP_NAME);
  });
});
