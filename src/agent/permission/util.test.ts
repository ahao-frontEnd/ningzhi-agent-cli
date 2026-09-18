import { isChangingDirectory } from "./util";

describe("isChangingDirectory", () => {
  it("detects cd command", () => {
    expect(isChangingDirectory("cd /tmp")).toBe(true);
    expect(isChangingDirectory("cd dir")).toBe(true);
  });

  it("detects cd in compound commands", () => {
    expect(isChangingDirectory("cd dir && ls")).toBe(true);
    expect(isChangingDirectory("ls; cd dir")).toBe(true);
    expect(isChangingDirectory("ls | cd dir")).toBe(true);
    expect(isChangingDirectory("ls & cd dir")).toBe(true);
  });

  it("detects chdir, pushd, popd", () => {
    expect(isChangingDirectory("chdir /tmp")).toBe(true);
    expect(isChangingDirectory("pushd /tmp")).toBe(true);
    expect(isChangingDirectory("popd")).toBe(true);
  });

  it("does not detect pwd", () => {
    expect(isChangingDirectory("pwd")).toBe(false);
  });

  it("does not detect words containing cd substring", () => {
    expect(isChangingDirectory("git checkout branch")).toBe(false);
    expect(isChangingDirectory("record audio")).toBe(false);
    expect(isChangingDirectory("abcd")).toBe(false);
  });

  it("does not detect safe commands", () => {
    expect(isChangingDirectory("ls -la")).toBe(false);
    expect(isChangingDirectory("npm install")).toBe(false);
    expect(isChangingDirectory("git status")).toBe(false);
  });
});
