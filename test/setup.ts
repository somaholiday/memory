// Prevents tests from reading live embedding credentials or running key commands.
// Each worker points at a nonexistent config path and clears environment credentials.

import * as os from "node:os";
import * as path from "node:path";

process.env.MEMORY_EMBEDDINGS_CONFIG = path.join(
  os.tmpdir(),
  `memory-vault-test-no-embeddings-${process.pid}.json`,
);
delete process.env.OPENAI_API_KEY;
