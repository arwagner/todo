import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A fresh directory under the system temp dir, removed once the test file's
 * tests have run. For tests that need real files rather than `:memory:`.
 */
export function scratchDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), `todo-${prefix}-`));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
