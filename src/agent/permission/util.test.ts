import { isChangingDirectory, isScriptExecution } from "./util";

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

describe("isScriptExecution", () => {
  it("blocks python scripts", () => {
    expect(isScriptExecution("python script.py").blocked).toBe(true);
    expect(isScriptExecution('python3 -c "print(1)"').blocked).toBe(true);
    expect(isScriptExecution("./script.py").blocked).toBe(true);
  });

  it("blocks js/ts scripts", () => {
    expect(isScriptExecution("node script.js").blocked).toBe(true);
    expect(isScriptExecution("tsx script.ts").blocked).toBe(true);
    expect(isScriptExecution("./app.ts").blocked).toBe(true);
  });

  it("blocks other language scripts", () => {
    expect(isScriptExecution("go run main.go").blocked).toBe(true);
    expect(isScriptExecution("ruby script.rb").blocked).toBe(true);
    expect(isScriptExecution("java Main").blocked).toBe(true);
  });

  it("allows shell scripts", () => {
    expect(isScriptExecution("bash script.sh").blocked).toBe(false);
    expect(isScriptExecution("sh script.sh").blocked).toBe(false);
    expect(isScriptExecution("zsh script.sh").blocked).toBe(false);
  });

  it("allows safe commands that reference script files without executing", () => {
    expect(isScriptExecution("cat script.py").blocked).toBe(false);
    expect(isScriptExecution("less app.js").blocked).toBe(false);
  });

  it("blocks compound commands containing script execution", () => {
    expect(isScriptExecution("echo done && python script.py").blocked).toBe(
      true,
    );
    expect(isScriptExecution("node app.js; echo done").blocked).toBe(true);
  });

  it("provides reason for blocked scripts", () => {
    expect(isScriptExecution("python script.py").reason).toContain("run_py");
    expect(isScriptExecution("node script.js").reason).toContain("run_js");
    expect(isScriptExecution("go run main.go").reason).toContain("shell");
  });
});
