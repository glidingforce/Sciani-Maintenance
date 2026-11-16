/** Name shown wherever a task is yours (stored as owner "me", so renaming never touches task data). */
const NAME_KEY = 'scinai-maintenance:my-name';
export const DEFAULT_NAME = 'Ilan';

export function getMyName(): string {
  try {
    return globalThis.localStorage?.getItem(NAME_KEY)?.trim() || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export function setMyName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* storage blocked: default name stays */
  }
}
