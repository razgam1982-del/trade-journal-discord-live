import { cookies } from 'next/headers';

// The journal is public-readable but edit-locked. Only a browser holding the
// EDIT_SECRET in this cookie may mutate data. If EDIT_SECRET is unset, editing
// is disabled for everyone — a safe read-only default.
export const EDIT_COOKIE = 'edit_key';

export async function isEditor(): Promise<boolean> {
  const secret = process.env.EDIT_SECRET;
  if (!secret) return false;
  const jar = await cookies();
  return jar.get(EDIT_COOKIE)?.value === secret;
}

// Guards a mutating server action. Throws when the caller isn't the owner.
export async function assertEditor(): Promise<void> {
  if (!(await isEditor())) {
    throw new Error('עריכה מותרת לבעלים בלבד — היומן פתוח לצפייה בלבד.');
  }
}
