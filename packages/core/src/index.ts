// Public interface for the shared memory vault implementation.
// Pi and command-line adapters import only from this module.

export { MemoryVault, openMemoryVault } from "./memory-vault.js";
export { formatSearchResponse } from "./search.js";
export { formatValidationResult, validateMemoryContent } from "./validation.js";
export type {
  OpenMemoryVaultOptions,
  WriteMemoryOptions,
} from "./memory-vault.js";
export type {
  MemoryEntry,
  SearchResult,
  VaultStatus,
  WriteResult,
} from "./types.js";
