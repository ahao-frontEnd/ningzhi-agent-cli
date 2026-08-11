import { greet } from "./index";

describe("greet", () => {
  it("should return a greeting", () => {
    expect(greet("Ningzhi")).toBe("Hello, Ningzhi!");
  });
});
