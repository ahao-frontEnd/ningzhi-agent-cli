import { search } from "./search";

describe("search", () => {
  it("returns foggy weather for sf query", async () => {
    const result = await search({ query: "sf weather" });
    expect(result).toBe("It's 60 degrees and foggy.");
  });

  it("returns foggy weather for San Francisco query (case insensitive)", async () => {
    const result = await search({ query: "San Francisco weather" });
    expect(result).toBe("It's 60 degrees and foggy.");
  });

  it("returns sunny weather for other queries", async () => {
    const result = await search({ query: "beijing weather" });
    expect(result).toBe("It's 90 degrees and sunny.");
  });
});
