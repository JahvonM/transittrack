import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import CoastalCardScene from "@/components/kiosk/CoastalCardScene";
import { nfcHint } from "../kioskLayout";
it.each(["phone", "tablet", "validator"])("uses the %s reader position", layout => {
  const hint = nfcHint(layout);
  const html = renderToStaticMarkup(React.createElement(CoastalCardScene, {tapHint:hint}));
  expect(html).toContain(hint.title);
  expect(html).toContain("/images/boarding-coaster.webp");
  expect(html).not.toContain("tt-coastal-checking");
});
it("shows checking without claiming success", () => {
  const html = renderToStaticMarkup(React.createElement(CoastalCardScene, {checking:true}));
  expect(html).toContain("tt-coastal-checking");
  expect(html).toContain("No need to tap again");
  expect(html).not.toContain("Welcome aboard");
});
