import { isDangerousPath } from "./is-dangerous-path";
import path from "node:path";
import os from "node:os";

describe("isDangerousPath", () => {
  it("returns false for a random safe path", () => {
    expect(isDangerousPath("/tmp/safe-file.txt")).toBe(false);
  });

  it("returns false for a path that looks dangerous but is not", () => {
    expect(isDangerousPath(path.join(os.homedir(), ".ssh-safe"))).toBe(false);
  });

  describe("macOS", () => {
    if (process.platform !== "darwin") return;

    it("matches absolute dangerous paths", () => {
      expect(isDangerousPath("/etc/passwd")).toBe(true);
    });

    it("matches dangerous path prefix", () => {
      expect(isDangerousPath("/private/tmp/secret")).toBe(true);
    });

    it("matches home directory dangerous paths with ~", () => {
      expect(isDangerousPath("~/.ssh/config")).toBe(true);
    });

    it("matches resolved relative path to dangerous directory", () => {
      const relativePath = path.relative(
        process.cwd(),
        path.join(os.homedir(), ".ssh", "config"),
      );
      expect(isDangerousPath(relativePath)).toBe(true);
    });

    it("matches ~/Documents", () => {
      expect(isDangerousPath("~/Documents/tax-return.pdf")).toBe(true);
    });

    it("matches glob pattern ~/.env.*", () => {
      expect(isDangerousPath("~/.env.local")).toBe(true);
      expect(isDangerousPath("~/.env.production")).toBe(true);
    });

    it("does not match glob pattern with wrong prefix", () => {
      expect(isDangerousPath("~/.env-backup")).toBe(false);
    });
  });

  describe("Linux", () => {
    if (process.platform !== "linux") return;

    it("matches /etc/shadow", () => {
      expect(isDangerousPath("/etc/shadow")).toBe(true);
    });

    it("matches /proc", () => {
      expect(isDangerousPath("/proc/1/status")).toBe(true);
    });

    it("matches ~/.env.* glob", () => {
      expect(isDangerousPath("~/.env.local")).toBe(true);
    });
  });

  describe("Windows", () => {
    if (process.platform !== "win32") return;

    it("matches %USERPROFILE%\\.ssh", () => {
      expect(isDangerousPath("%USERPROFILE%\\.ssh\\config")).toBe(true);
    });

    it("matches C:\\Windows\\System32", () => {
      expect(isDangerousPath("C:\\Windows\\System32\\calc.exe")).toBe(true);
    });

    it("matches %APPDATA% paths", () => {
      expect(isDangerousPath("%APPDATA%\\Slack\\logs")).toBe(true);
    });
  });
});
