/**
 * Minimal pub/sub emitter mixin for Model.
 * Uses Map<string, Set<Function>> for O(1) add/remove.
 * No dependencies, no wildcard support — intentionally minimal.
 */
export default class ModelEmitter {
  _listeners = new Map();

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (set) {
      for (const callback of set) {
        callback(...args);
      }
    }
  }
}
