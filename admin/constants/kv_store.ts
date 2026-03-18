import { KVStoreKey } from "../types/kv_store.js";

export const SETTINGS_KEYS: KVStoreKey[] = [
  'chat.suggestionsEnabled',
  'chat.lastModel',
  'chat.folders',
  'ollama.prewarmOnBoot',
  'ollama.keepModelWarm',
  'ui.hasVisitedEasySetup',
  'system.earlyAccess',
  'ai.assistantCustomName',
];
