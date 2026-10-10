// Web Worker (module): nhận {id, def, moves, level} → trả {id, move}
import { chooseFor } from './variant-ai.js';
self.onmessage = (e) => {
  const { id, def, moves, level } = e.data;
  try { self.postMessage({ id, move: chooseFor(def, moves, level) }); }
  catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
