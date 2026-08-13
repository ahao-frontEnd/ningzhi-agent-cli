import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

export function createCommand(): Command {
  const program = new Command();

  program.name(pkg.name).description(pkg.description).version(pkg.version);

  return program;
}
