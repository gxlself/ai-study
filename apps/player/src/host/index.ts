export { NavigationManager, normalizeNavKey, spatialScore, findSpatialTarget } from './navigation';
export type { Direction, NavigationRect, ScopeOptions } from './navigation';
export { createGateSequence, advanceGate, isGateExpired, GATE_DIRECTIONS, PARENT_GATE_IDLE_MS } from './gate';
export { SpeechEngine, resolveSpeechAudio, SPEECH_TIMEOUT_MS } from './speech';
export type { SpeechEngineConfig, SpeechManifest } from './speech';
export { ActivityRegistry, SproutHost } from './registry';
export type { PluginLoadError } from './registry';
export { createResources, preloadLesson, PRELOAD_TIMEOUT_MS } from './resources';
export type { ActivityResources, ResourceOptions } from './resources';
export type {
  ActivityPlugin, ConceptView, InputMode, NavKey, SpeakOptions, SfxName,
} from '../../../../packages/plugin-sdk/src/types';
