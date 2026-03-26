/**
 * tokens.js – Token (saved-clip) management for the Astra Ring Sound Machine.
 *
 * Tokens represent recorded music clips. They are stored in localStorage so
 * they persist across sessions. Each token contains:
 *   - id        {string}   unique identifier
 *   - name      {string}   user-visible name
 *   - createdAt {string}   ISO timestamp
 *   - events    {object[]} list of recorded play events
 */

const TokenStore = (() => {
  const STORAGE_KEY = 'astra_tokens';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (err) {
      console.warn('AstraTokenStore: failed to load tokens from localStorage:', err);
      return [];
    }
  }

  function save(tokens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  /** Return all saved tokens. */
  function getAll() {
    return load();
  }

  /**
   * Save a new token from a list of recorded events.
   * @param {string}   name    - Human-readable clip name
   * @param {object[]} events  - Array of {type, ringId, mode, bendSemitones, t} objects
   * @returns {object} the saved token
   */
  function saveToken(name, events) {
    const tokens = load();
    const token = {
      id:        crypto.randomUUID(),
      name:      name.trim() || `Clip ${tokens.length + 1}`,
      createdAt: new Date().toISOString(),
      events,
    };
    tokens.unshift(token);
    save(tokens);
    return token;
  }

  /**
   * Delete a token by id.
   * @param {string} id
   */
  function deleteToken(id) {
    const tokens = load().filter(t => t.id !== id);
    save(tokens);
  }

  /**
   * Retrieve a single token by id.
   * @param {string} id
   * @returns {object|undefined}
   */
  function getToken(id) {
    return load().find(t => t.id === id);
  }

  return { getAll, saveToken, deleteToken, getToken };
})();
