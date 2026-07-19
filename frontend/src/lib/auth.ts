export type StaffRole = "STAFF" | "ADMIN";

export interface StaffSession {
  id: string;
  clubId: string;
  email: string;
  name: string;
  role: StaffRole;
  demoAdmin?: boolean;
}

export interface AuthSession {
  token: string | null;
  staff: StaffSession | null;
  demoTempPin: string | null;
}

type AuthListener = (session: AuthSession) => void;

let token: string | null = null;
let staff: StaffSession | null = null;
let demoTempPin: string | null = null;
const listeners = new Set<AuthListener>();

const snapshot = (): AuthSession => ({ token, staff, demoTempPin });

const notify = (): void => {
  const session = snapshot();
  listeners.forEach((listener) => listener(session));
};

export const authStore = {
  getSession: snapshot,
  getToken: () => token,
  setSession: (nextToken: string, nextStaff: StaffSession, options?: { demoTempPin?: string | null }): void => {
    token = nextToken;
    staff = nextStaff;
    demoTempPin = options?.demoTempPin ?? null;
    notify();
  },
  clear: (): void => {
    token = null;
    staff = null;
    demoTempPin = null;
    notify();
  },
  subscribe: (listener: AuthListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
