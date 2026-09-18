import {
  isChangingDirectory,
  isScriptExecution,
  isDangerousOperation,
} from "./util";

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

// ===============================================================================================

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

// ===============================================================================================
// 测试危险命令
// ===============================================================================================
describe("isDangerousOperation", () => {
  it("blocks sudo", () => {
    expect(isDangerousOperation("sudo rm file").blocked).toBe(true);
    expect(isDangerousOperation("doas apt update").blocked).toBe(true);
  });

  it("blocks delete commands", () => {
    expect(isDangerousOperation("rm -rf dir").blocked).toBe(true);
    expect(isDangerousOperation("rmdir dir").blocked).toBe(true);
    expect(isDangerousOperation("del file.txt").blocked).toBe(true);
  });

  it("blocks modify commands", () => {
    expect(isDangerousOperation("mv old new").blocked).toBe(true);
    expect(isDangerousOperation("cp src dst").blocked).toBe(true);
    expect(isDangerousOperation("touch file").blocked).toBe(true);
    expect(isDangerousOperation("mkdir dir").blocked).toBe(true);
  });

  it("blocks permission commands", () => {
    expect(isDangerousOperation("chmod 755 file").blocked).toBe(true);
    expect(isDangerousOperation("chown user file").blocked).toBe(true);
  });

  it("blocks process/service commands", () => {
    expect(isDangerousOperation("kill 1234").blocked).toBe(true);
    expect(isDangerousOperation("systemctl restart nginx").blocked).toBe(true);
    expect(isDangerousOperation("shutdown now").blocked).toBe(true);
  });

  it("blocks user management commands", () => {
    expect(isDangerousOperation("useradd newuser").blocked).toBe(true);
    expect(isDangerousOperation("passwd").blocked).toBe(true);
  });

  it("blocks sensitive info commands", () => {
    expect(isDangerousOperation("env").blocked).toBe(true);
    expect(isDangerousOperation("printenv").blocked).toBe(true);
    expect(isDangerousOperation("history").blocked).toBe(true);
  });

  it("blocks network/remote commands", () => {
    expect(isDangerousOperation("ssh user@host").blocked).toBe(true);
    expect(isDangerousOperation("curl http://example.com").blocked).toBe(true);
    expect(isDangerousOperation("wget http://example.com").blocked).toBe(true);
    expect(isDangerousOperation("nc -l 8080").blocked).toBe(true);
  });

  it("blocks output redirection", () => {
    expect(isDangerousOperation("echo hello > file.txt").blocked).toBe(true);
    expect(isDangerousOperation("cat file >> other.txt").blocked).toBe(true);
  });

  it("blocks nested shell commands", () => {
    expect(isDangerousOperation('bash -c "rm file"').blocked).toBe(true);
    expect(isDangerousOperation('sh -c "cp a b"').blocked).toBe(true);
  });

  it("allows safe read-only commands", () => {
    expect(isDangerousOperation("ls -la").blocked).toBe(false);
    expect(isDangerousOperation("cat file.txt").blocked).toBe(false);
    expect(isDangerousOperation("grep pattern file.txt").blocked).toBe(false);
    expect(isDangerousOperation("ps aux").blocked).toBe(false);
    expect(isDangerousOperation("git status").blocked).toBe(false);
  });

  it("provides reason for blocked operations", () => {
    expect(isDangerousOperation("rm file").reason).toContain("rm");
    expect(isDangerousOperation("echo hello > file.txt").reason).toContain(
      "重定向",
    );
  });
});
