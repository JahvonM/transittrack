import { describe, expect, it } from "vitest";
import { codeFromJoinQr } from "./companyJoin";

describe("codeFromJoinQr", () => {
  it("reads the code from a company join QR link", () => {
    expect(codeFromJoinQr("https://eager-transit-track-go.base44.app/join#code=abcd2345efgh")).toBe("ABCD2345EFGH");
  });
  it("accepts a bare company code", () => {
    expect(codeFromJoinQr(" abcd2345efgh ")).toBe("ABCD2345EFGH");
  });
  it("refuses other QR codes", () => {
    expect(codeFromJoinQr("https://example.com/pay#code=ABCD2345EFGH")).toBe("");
    expect(codeFromJoinQr("https://example.com/join#code=<script>")).toBe("");
    expect(codeFromJoinQr("hello")).toBe("");
    expect(codeFromJoinQr("")).toBe("");
  });
});
