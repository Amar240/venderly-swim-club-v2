export type StaffRole = "STAFF" | "ADMIN";

export interface StaffSession {
  id: string;
  clubId: string;
  email: string;
  name: string;
  role: StaffRole;
}

export interface AuthSession {
  token: string | null;
  staff: StaffSession | null;
}

type AuthListener = (session: AuthSession) => void;

let token: string | null = null;
let staff: StaffSession | null = null;
const listeners = new Set<AuthListener>();

const snapshot = (): AuthSession => ({ token, staff });

const notify = (): void => {
  const session = snapshot();
  listeners.forEach((listener) => listener(session));
};

export const authStore = {
  getSession: snapshot,
  getToken: () => token,
  setSession: (nextToken: string, nextStaff: StaffSession): void => {
    token = nextToken;
    staff = nextStaff;
    notify();
  },
  clear: (): void => {
    token = null;
    staff = null;
    notify();
  },
  subscribe: (listener: AuthListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
