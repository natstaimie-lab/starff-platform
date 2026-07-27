/**
 * AuthContext — the single source of truth for "who is signed in and what can
 * they do". Wraps Supabase Auth (the SAME identity system as the website and
 * portals) and exposes role-aware helpers to the rest of the app.
 *
 * Responsibilities:
 *  - restore / observe the Supabase session (persisted in encrypted storage),
 *  - resolve the app role (candidate | employer) so navigation can branch,
 *  - idempotently ensure a candidate's backend profile exists on first login,
 *  - sign in / register / sign out,
 *  - optional biometric unlock as a convenience after the first login.
 *
 * There is NO parallel auth here — passwords go straight to Supabase, tokens
 * live in the device secure store, and the backend authorises every call.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { candidateApi, clientApi } from '@/lib/endpoints';

export type AppRole = 'candidate' | 'employer';

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  role: AppRole | null;
  /** True once a session exists but before role resolution finishes. */
  resolvingRole: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUpCandidate: (input: CandidateSignUp) => Promise<{ needsEmailConfirm: boolean }>;
  signUpEmployer: (input: EmployerSignUp) => Promise<{ needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  // Biometric convenience
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  authenticateBiometric: () => Promise<boolean>;
}

/** Map a registration work pattern to weekly day numbers (0=Sun … 6=Sat). */
function patternToDays(pattern?: string): number[] {
  switch (pattern) {
    case 'Full-time': return [1, 2, 3, 4, 5]; // Mon–Fri
    case 'Part-time': return [1, 3, 5]; // Mon, Wed, Fri
    case 'Weekends': return [6, 0]; // Sat, Sun
    default: return [];
  }
}

interface CandidateSignUp {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  postcode?: string;
  dateOfBirth?: string;
  // Onboarding wizard fields (applied to the profile on first login).
  rightToWorkType?: string;
  nationalInsurance?: string;
  headline?: string;
  shiftPreference?: string;
  /** Full-time | Part-time | Weekends — seeds the weekly availability days. */
  availabilityPattern?: string;
  consentGdpr?: boolean;
  agreementAccepted?: boolean;
  signatureName?: string;
}
interface EmployerSignUp {
  email: string;
  password: string;
  companyName: string;
}

const BIOMETRIC_FLAG = 'starff_biometric_enabled';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [resolvingRole, setResolvingRole] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const bootstrappedFor = useRef<string | null>(null);

  // Detect biometric hardware + stored preference once.
  useEffect(() => {
    (async () => {
      const [hasHardware, enrolled, flag] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(BIOMETRIC_FLAG),
      ]);
      setBiometricAvailable(hasHardware && enrolled);
      setBiometricEnabledState(flag === 'true');
    })();
  }, []);

  // Observe the session and resolve role whenever it changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setRole(null);
      bootstrappedFor.current = null;
      return;
    }
    if (bootstrappedFor.current === session.user.id) return;
    bootstrappedFor.current = session.user.id;
    void resolveAndBootstrap(session);
  }, [session]);

  async function resolveAndBootstrap(s: Session) {
    setResolvingRole(true);
    try {
      const meta = s.user.user_metadata ?? {};
      const intended = meta.role as AppRole | undefined;

      // For a candidate, make sure the backend profile row exists (idempotent).
      if (intended === 'candidate') {
        await ensureCandidateProfile(s);
        setRole('candidate');
        return;
      }
      if (intended === 'employer') {
        await ensureEmployerCompany(s);
        setRole('employer');
        return;
      }

      // No metadata hint (e.g. account created on the website) → probe.
      try {
        const c = await apiFetch<{ id?: string }>('/candidates/me');
        if (c?.id) {
          setRole('candidate');
          return;
        }
      } catch {
        /* not a candidate */
      }
      try {
        await apiFetch('/client/me');
        setRole('employer');
        return;
      } catch {
        /* not a client */
      }
      // Unknown role (likely an admin/recruiter) — the app is worker/employer
      // only, so keep them out with a clear message elsewhere.
      setRole(null);
    } finally {
      setResolvingRole(false);
    }
  }

  async function ensureCandidateProfile(s: Session) {
    const meta = (s.user.user_metadata ?? {}) as Record<string, unknown>;
    try {
      const candidate = await candidateApi.ensureProfile({
        userId: s.user.id,
        email: s.user.email ?? '',
        firstName: (meta.firstName as string) ?? '',
        lastName: (meta.lastName as string) ?? '',
        registrationSource: 'MOBILE',
      });

      // Apply the registration-wizard onboarding ONCE per device, so we never
      // overwrite edits the candidate later makes in-app.
      const flagKey = `starff_onboarded_${s.user.id}`;
      const alreadyApplied = await AsyncStorage.getItem(flagKey);
      if (!alreadyApplied && candidate?.id) {
        const patch: Record<string, unknown> = {};
        for (const k of ['phone', 'postcode', 'dateOfBirth', 'rightToWorkType', 'nationalInsurance', 'headline', 'shiftPreference'] as const) {
          if (meta[k]) patch[k] = meta[k];
        }
        if (Object.keys(patch).length) {
          try { await candidateApi.updateProfile(candidate.id, patch); } catch { /* best-effort */ }
        }
        if (meta.consentGdpr || meta.agreementAccepted || meta.signatureName) {
          try {
            await candidateApi.setDeclarations({
              consentGdpr: !!meta.consentGdpr,
              agreementAccepted: !!meta.agreementAccepted,
              signatureName: meta.signatureName,
            });
          } catch { /* best-effort */ }
        }
        // Seed weekly availability from the chosen work pattern — but only if the
        // candidate has none yet, so we never wipe days set elsewhere. This makes
        // the pattern real: it shows on the dashboard, admin, matcher and client.
        const patternDays = patternToDays(meta.availabilityPattern as string | undefined);
        if (patternDays.length && !candidate.availability?.length) {
          try { await candidateApi.setAvailability(patternDays); } catch { /* best-effort */ }
        }
        await AsyncStorage.setItem(flagKey, '1');
      }
    } catch {
      // Non-fatal: the dashboard will retry, and staff-created profiles exist.
    }
  }

  async function ensureEmployerCompany(s: Session) {
    const meta = s.user.user_metadata ?? {};
    try {
      await clientApi.registerCompany({
        companyName: (meta.companyName as string) ?? 'My company',
        firstName: (meta.firstName as string) ?? undefined,
        lastName: (meta.lastName as string) ?? undefined,
      });
    } catch {
      // Non-fatal: idempotent; admin-created clients already have a company.
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      role,
      resolvingRole,
      biometricAvailable,
      biometricEnabled,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
      },
      async signUpCandidate(input) {
        const { data, error } = await supabase.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: {
            data: {
              role: 'candidate',
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              postcode: input.postcode,
              dateOfBirth: input.dateOfBirth,
              rightToWorkType: input.rightToWorkType,
              nationalInsurance: input.nationalInsurance,
              headline: input.headline,
              shiftPreference: input.shiftPreference,
              availabilityPattern: input.availabilityPattern,
              consentGdpr: input.consentGdpr,
              agreementAccepted: input.agreementAccepted,
              signatureName: input.signatureName,
            },
          },
        });
        if (error) throw new Error(error.message);
        return { needsEmailConfirm: !data.session };
      },
      async signUpEmployer(input) {
        const { data, error } = await supabase.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: {
            data: { role: 'employer', companyName: input.companyName },
          },
        });
        if (error) throw new Error(error.message);
        return { needsEmailConfirm: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
        setRole(null);
      },
      async setBiometricEnabled(on) {
        await SecureStore.setItemAsync(BIOMETRIC_FLAG, on ? 'true' : 'false');
        setBiometricEnabledState(on);
      },
      async authenticateBiometric() {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Starff',
          fallbackLabel: 'Use passcode',
        });
        return res.success;
      },
    }),
    [
      loading,
      session,
      role,
      resolvingRole,
      biometricAvailable,
      biometricEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
