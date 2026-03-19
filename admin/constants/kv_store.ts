import { KVStoreKey } from "../types/kv_store.js";

export const SETTINGS_KEYS: KVStoreKey[] = [
  'chat.suggestionsEnabled',
  'chat.lastModel',
  'chat.folders',
  'ollama.prewarmOnBoot',
  'ollama.keepModelWarm',
  'ollama.defaultChatModel',
  'ollama.prewarmDefaultChatModel',
  'ollama.helperTextModel',
  'ollama.helperEmbeddingModel',
  'ollama.prewarmHelperModels',
  'rag.maxUploadSizeMb',
  'rag.watchFolderPath',
  'ui.hasVisitedEasySetup',
  'system.earlyAccess',
  'ai.assistantCustomName',
  'ai.assistantContextPrompt',
];
