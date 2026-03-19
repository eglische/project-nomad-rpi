# Fork Progress Tracker

This file tracks fork-specific work only. It is intentionally limited to changes and extensions added in this fork, not the full original Project N.O.M.A.D. feature set.

## Completed

- **AI Assistant**: Added helper-model persistence so the configured text helper and embedding/RAG helper models are kept resident instead of being unloaded during main chat-model switches.
- **AI Assistant**: Added explicit chat-model loading controls so the main inference model can be selected and loaded separately from helper models.
- **AI Assistant**: Added model prewarm and keep-warm settings for chat and helper models.
- **AI Assistant**: Added prompt context injection settings so users can steer assistant behavior beyond the assistant name alone.
- **AI Assistant**: Added live activity and model-loading feedback in the chat UI, including background-work warnings when indexing or downloads may slow inference.

- **Recovery**: Added preserved-data detection and recovery import flows so existing Kiwix and Kolibri data can be reconnected after a reinstall.
- **Recovery**: Added installer safeguards to avoid formatting recovery-looking Nomad disks unless explicitly forced.
- **Recovery**: Added installer-side persistence of install secrets on external storage so recovery installs can reuse them.
- **Recovery**: Added reset recovery handling for old MySQL metadata, including backup of preserved data before reinitialization.
- **Recovery**: Added BullMQ/Redis reset handling during metadata-reset recovery so stale background jobs do not poison a fresh recovered install.

- **Storage**: Added external-storage-aware install logic so service data can live on USB/HDD-backed Nomad storage instead of the TF/SD card.
- **Storage**: Repointed service storage paths to external storage for Pi installs, including Ollama, Kiwix, and Kolibri.
- **Storage**: Added configurable knowledge-base upload limits and a watched import folder for bulk RAG ingestion.
- **Storage**: Added watched-folder syncing so external file drops can be discovered and queued for embedding.

- **Diagnostics**: Added a Health & Help layer in Settings with plain-language diagnostics, status coloring, and frontend-visible repair actions.
- **Diagnostics**: Added a live activity panel showing active, queued, retrying, and failed jobs instead of requiring users to inspect raw backend logs.
- **Diagnostics**: Added reconciliation logic to soft-recover stopped services and expose dependency failures more clearly.
- **Diagnostics**: Added actions to clear failed jobs and retry stale/background work from the web UI.

- **Content / Library**: Added Kiwix source re-resolution so stale `404` ZIM URLs can be mapped to newer upstream files instead of failing permanently.
- **Content / Library**: Reworked the remote ZIM explorer into a more general remote content explorer with catalog search, repository browsing, and direct URL import.
- **Content / Library**: Added multi-file knowledge-base upload support so multiple PDFs/files can be queued in one action.

- **Radio / SDR**: Added a containerized `Radio` app using `welle-cli`.
- **Radio / SDR**: Added a containerized `Spectrum Analyzer` app using OpenWebRX+.
- **Radio / SDR**: Added `/radio` as a unified entry point that lets users launch Radio or Spectrum Analyzer without manually managing both apps.
- **Radio / SDR**: Added RTL-SDR device preparation and single-dongle handoff logic so Radio and Spectrum Analyzer do not fight over the same hardware.
- **Radio / SDR**: Added OpenWebRX defaults for cleaner first-run setup, including persistent config, default credentials, and better receiver branding.
- **Radio / SDR**: Added custom OpenWebRX band-roaming patches and default FM/Airband/AM/CB profiles so the SDR frontend is more usable for practical listening and scanning.

- **Pi 5 / ARM64**: Added Pi-aware image/platform logic so ARM64-compatible service images are selected correctly during install.
- **Pi 5 / ARM64**: Added Pi-specific handling for Kolibri and other services that needed ARM64-aware image or storage logic.
- **Pi 5 / ARM64**: Added Pi 5 page-size / 4K-kernel handling needed for Qdrant and AI services on this hardware.
- **Pi 5 / ARM64**: Added installer-side NVIDIA/CUDA preflight and setup logic for Pi 5 eGPU-backed Ollama inference.

- **UI / UX**: Added chat folders, rename/delete controls, and better organization of conversations in the chat sidebar.
- **UI / UX**: Added collapsible sections and a floating top button to improve long-page navigation in Settings.
- **UI / UX**: Added storage-selection improvements in easy setup so external Nomad storage is preferred over the small root card when present.

## Next

- **AI Assistant**: Keep refining chat model-load progress so long model swaps feel clearly alive without relying on misleading percentages.
- **AI Assistant**: Add even clearer helper-model state and residency visibility in Settings and Chat.

- **Recovery**: Extend recovery detection to more services where preserved data exists without matching metadata.
- **Recovery**: Add a manual recovery / reconcile pass that can be re-run later from Settings without relying on first-boot detection alone.

- **Content / Library**: Add user-editable content source overrides so broken upstream URLs can be corrected from the UI and stored locally.
- **Content / Library**: Expand supported KB document formats beyond the current extraction path where it is reliable to do so.

- **Radio / SDR**: Build a more polished combined `/radio` experience that treats Radio and Spectrum Analyzer as one user-facing Nomad module.
- **Radio / SDR**: Continue improving OpenWebRX behavior toward a more desktop-like roaming/scanning workflow across wide bands.

- **Pi 5 / ARM64**: Validate the full ab initio fresh-card install path again on another Pi using only the GitHub installer.
- **Pi 5 / ARM64**: Keep tightening recovery, storage, and CUDA setup so fresh installs and recovery installs behave the same way.
