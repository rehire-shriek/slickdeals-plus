# Slickdeals+

Tampermonkey userscript that enhances the Slickdeals frontpage with deal filtering, sorting, price highlighting, ad removal, and redirect bypass.

## Shared Standards (auto-loaded)

@loom-shared/architecture.md
@loom-shared/protocol.md

## Architecture

Single-file userscript (`slickdeals-plus-v32.3.9.js`, ~1,511 lines). No build system, no dependencies, no framework — vanilla ES6+ JavaScript in a single IIFE with named inner modules wired via a shared `context` object.

**Module order:** suppressAdErrors → log → safeExecute → ToastModule → ConstantsModule → ValidationModule → UtilsModule → LinkResolutionModule → SettingsModule → MenuModule → StylesModule → ProcessingModule → SortingModule → init()

**Key rules:**
- All DOM selectors live in `ConstantsModule.SELECTORS` — never hard-code selectors elsewhere
- All setting defaults live in `ConstantsModule.DEFAULTS` — new settings must also be added to ValidationModule and MenuModule
- Settings use dual storage (GM_setValue + localStorage) — maintain both writes until consolidation
- The processing pipeline order in ProcessingModule must be preserved
- MutationObserver must not re-trigger on the script's own DOM mutations
