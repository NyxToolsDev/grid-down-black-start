// localStorage persistence, base64 export/import — same contract as Grid Down.

const RUN_KEY = 'gdbs_run_v1';
const META_KEY = 'gdbs_meta_v1';

export const saveRun = (state) => {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(state)); } catch { /* full */ }
};

export const loadRun = () => {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : null;
  } catch { return null; }
};

export const clearRun = () => {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
};

export const loadMeta = () => {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
};

export const saveMeta = (meta) => {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
};

export const exportSave = (state) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(state))));

export const importSave = (str) => {
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    return s && s.v === 1 ? s : null;
  } catch { return null; }
};
