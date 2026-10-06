export type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: unknown;
};

type StoredUser = LocalUser & {
  password: string;
};

const USERS_KEY = "ecr-local-users";
const SESSION_KEY = "ecr-local-session";
export const PASSWORD_REQUIREMENT_HINT =
  "Use at least 8 characters with uppercase, lowercase, number, and symbol.";
export function checkPasswordRequirements(password: string) {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}
export function isPasswordStrong(password: string) {
  return Object.values(checkPasswordRequirements(password)).every(Boolean);
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getLocalSession(): LocalUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalUser) : null;
  } catch {
    return null;
  }
}

export function registerLocalUser(input: {
  name: string;
  email: string;
  password: string;
}): LocalUser {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (name.length < 2) throw new Error("Enter your full name.");
  if (!email || !email.includes("@"))
    throw new Error("Enter a valid email address.");
  if (!isPasswordStrong(password)) throw new Error(PASSWORD_REQUIREMENT_HINT);

  const users = readUsers();
  if (users.some(user => user.email === email)) {
    throw new Error("An account with this email already exists.");
  }

  const user: StoredUser = {
    id: `local-${crypto.randomUUID()}`,
    name,
    email,
    password,
    role: "user",
    createdAt: new Date().toISOString(),
  };
  writeUsers([...users, user]);
  const session = toPublicUser(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signInLocalUser(
  emailInput: string,
  password: string
): LocalUser {
  const email = emailInput.trim().toLowerCase();
  const user = readUsers().find(candidate => candidate.email === email);
  if (!user || user.password !== password) {
    throw new Error("The email or password is incorrect.");
  }
  const session = toPublicUser(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOutLocalUser() {
  localStorage.removeItem(SESSION_KEY);
}

function toPublicUser(user: StoredUser): LocalUser {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

export const LOCAL_AUTH_NOTICE =
  "Accounts and sessions use secure authentication.";
