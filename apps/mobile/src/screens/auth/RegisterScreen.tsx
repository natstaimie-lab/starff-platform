import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthShell } from '@/screens/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { SignaturePad } from '@/components/SignaturePad';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';
import type { AuthStackParams } from '@/navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParams, 'Register'>;
type Role = 'candidate' | 'employer';

const SECTORS = ['Logistics', 'Events', 'Construction', 'Delivery', 'Hospitality', 'Driving'];
const STEP_TITLES = ['About you', 'Work preferences', 'Eligibility & account', 'Agreements & signature'];
const LAST = STEP_TITLES.length - 1;

// ── field format helpers ──────────────────────────────────────────────
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const isUKPhone = (v: string) => {
  const d = digitsOnly(v);
  return /^0\d{9,10}$/.test(d) || /^44\d{9,10}$/.test(d); // 07… / 01… / 02… or +44…
};
const isUKPostcode = (v: string) =>
  /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(v.trim().toUpperCase());
// Type digits, get DD/MM/YYYY with separators inserted automatically.
const formatDob = (v: string) => {
  const d = digitsOnly(v).slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};
const isDob = (v: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const day = +m[1], mon = +m[2], yr = +m[3];
  const dt = new Date(yr, mon - 1, day);
  if (dt.getFullYear() !== yr || dt.getMonth() !== mon - 1 || dt.getDate() !== day) return false;
  const age = (Date.now() - dt.getTime()) / (365.25 * 864e5);
  return age >= 16 && age <= 100;
};
const dobToISO = (v: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

const LEGAL: Record<string, { title: string; updated: string; body: [string, string][] }> = {
  terms: {
    title: 'Terms & Conditions',
    updated: 'Last updated 1 June 2026',
    body: [
      ['Your agreement with Starff', 'By registering you enter an agreement with Starff Recruitment Ltd to be supplied as a temporary worker to Starff’s hirers. We are an employment business under the Conduct of Employment Agencies and Employment Businesses Regulations 2003.'],
      ['Assignments & pay', 'Each shift you accept is a separate assignment. You are paid weekly for verified, approved hours at the agreed rate, including 12.07% rolled-up holiday pay, less PAYE tax, National Insurance and any pension contributions.'],
      ['Your responsibilities', 'You agree to provide accurate information, hold valid right-to-work and any required licences (DBS, CSCS, CPC, SIA), attend confirmed shifts, and follow each hirer’s site and safety rules.'],
      ['Ending the relationship', 'Either party may end the relationship at any time. Completed approved hours remain payable. Misconduct or false information may result in removal from the platform.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated 1 June 2026',
    body: [
      ['What we collect', 'Identity and contact details, right-to-work evidence, qualifications, DBS results, bank and National Insurance details, timesheets, and device data needed to operate the service.'],
      ['How we use it', 'To verify your eligibility, match you to shifts, run payroll, meet legal and tax obligations, and keep the platform secure. A human reviews any decision that materially affects you.'],
      ['Sharing', 'We share only what is necessary with hirers, HMRC, our DBS umbrella body, and payroll providers. We never sell your data.'],
      ['Security & retention', 'Data is encrypted with 256-bit AES in transit and at rest, and kept only as long as the law and legitimate business needs require.'],
    ],
  },
  gdpr: {
    title: 'GDPR Data Consent',
    updated: 'UK GDPR & Data Protection Act 2018',
    body: [
      ['Lawful basis', 'We process your data to perform our contract with you and to meet legal obligations (right-to-work, tax, DBS). Special-category and criminal-record data (e.g. DBS) is processed under the employment-law condition and with your explicit consent.'],
      ['Your consent', 'By signing you give explicit consent for Starff to carry out identity, right-to-work and DBS checks, and to process the results for the purpose of placing you in suitable work.'],
      ['Your rights', 'You may access, correct, port or erase your data, object to or restrict processing, and withdraw consent at any time by contacting privacy@starff.co.uk.'],
      ['Complaints', 'You have the right to complain to the Information Commissioner’s Office (ICO) if you believe your data has been mishandled.'],
    ],
  },
};

export function RegisterScreen({ navigation, route }: Props) {
  const { signUpCandidate, signUpEmployer } = useAuth();
  const [role, setRole] = useState<Role>(route.params?.role ?? 'candidate');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [viewDoc, setViewDoc] = useState<string | null>(null);

  // Fields
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [postcode, setPostcode] = useState('');
  const [dob, setDob] = useState('');
  const [sectors, setSectors] = useState<string[]>([]);
  const [prefRole, setPrefRole] = useState('');
  const [avail, setAvail] = useState('Full-time');
  const [rtw, setRtw] = useState('UK citizen');
  const [ni, setNi] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [gdpr, setGdpr] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [signed, setSigned] = useState(false);

  const emailOk = isEmail(email);
  const phoneOk = isUKPhone(phone);
  const postcodeOk = isUKPostcode(postcode);
  const dobOk = isDob(dob);
  const isReg = role === 'candidate';

  // per-step validity
  let ready = false;
  if (role === 'employer') ready = !!(company.trim() && emailOk && password.length >= 4);
  else if (step === 0) ready = !!(name.trim() && emailOk && phoneOk && postcodeOk && dobOk);
  else if (step === 1) ready = sectors.length > 0;
  else if (step === 2) ready = password.length >= 4;
  else ready = terms && privacy && gdpr && signed;

  const toggleSector = (s: string) =>
    setSectors((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const advance = async () => {
    if (!ready) return;
    if (isReg && step < LAST) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      let res: { needsEmailConfirm: boolean };
      if (role === 'candidate') {
        const [firstName, ...rest] = name.trim().split(' ');
        res = await signUpCandidate({
          email,
          password,
          firstName,
          lastName: rest.join(' '),
          phone,
          postcode: postcode.trim().toUpperCase(),
          dateOfBirth: dobToISO(dob),
          rightToWorkType: rtw,
          nationalInsurance: ni || undefined,
          headline: prefRole || sectors.join(', ') || undefined,
          availabilityPattern: avail,
          consentGdpr: gdpr,
          agreementAccepted: terms,
          signatureName: name.trim(),
        });
      } else {
        res = await signUpEmployer({ email, password, companyName: company });
      }
      if (res.needsEmailConfirm) {
        Alert.alert(
          'Confirm your email',
          'We sent a confirmation link to your email. Verify it, then sign in — your details and signature are saved to finish your profile.',
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
        );
      }
    } catch (err) {
      Alert.alert('Registration failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cta = role === 'employer' ? 'Create account' : step < LAST ? 'Continue' : 'Create account';
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const onBack = isReg && step > 0 ? () => setStep(step - 1) : () => navigation.goBack();

  return (
    <>
      <AuthShell onBack={onBack}>
        <Text style={styles.h1}>{isReg ? 'Register as a worker' : 'Create your account'}</Text>
        <Text style={styles.sub}>
          {isReg
            ? `Step ${step + 1} of ${STEP_TITLES.length} · ${STEP_TITLES[step]}`
            : 'Post roles and hire vetted, compliant staff.'}
        </Text>

        {isReg ? (
          <View style={styles.steps}>
            {STEP_TITLES.map((_, i) => (
              <View key={i} style={[styles.bar, i < step ? styles.barOn : i === step ? styles.barCur : null]} />
            ))}
          </View>
        ) : null}

        {/* Role select — only on the first screen */}
        {(!isReg || step === 0) ? (
          <View style={styles.roleSeg}>
            <RoleOption on={role === 'candidate'} icon="helmet" title="I'm looking for work" subtitle="Find shifts, get paid weekly" onPress={() => { setRole('candidate'); setStep(0); }} />
            <RoleOption on={role === 'employer'} icon="building" title="I need staff" subtitle="Book vetted temporary workers" onPress={() => { setRole('employer'); setStep(0); }} />
          </View>
        ) : null}

        {/* EMPLOYER */}
        {role === 'employer' ? (
          <>
            <Field label="Company name"><Input onDark value={company} onChangeText={setCompany} placeholder="Tesco Distribution" /></Field>
            <Field label="Work email"><Input onDark value={email} onChangeText={setEmail} placeholder="you@company.com" autoCapitalize="none" keyboardType="email-address" /></Field>
            <Field label="Create password"><Input onDark value={password} onChangeText={setPassword} placeholder="At least 4 characters" secureTextEntry /></Field>
          </>
        ) : null}

        {/* CANDIDATE — STEP 0 */}
        {isReg && step === 0 ? (
          <>
            <Field label="Full name"><Input onDark value={name} onChangeText={setName} placeholder="Jamie Smith" /></Field>
            <Field label="Email"><Input onDark value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" /></Field>
            {email.length > 0 && !emailOk ? <Text style={styles.err}>Enter a valid email address.</Text> : null}
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Mobile"><Input onDark value={phone} onChangeText={setPhone} placeholder="07700 900000" keyboardType="phone-pad" maxLength={16} /></Field>
                {phone.length > 0 && !phoneOk ? <Text style={styles.err}>Enter a valid UK number.</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Postcode"><Input onDark value={postcode} onChangeText={(v) => setPostcode(v.toUpperCase())} placeholder="RM18 7AB" autoCapitalize="characters" autoCorrect={false} maxLength={8} /></Field>
                {postcode.length > 0 && !postcodeOk ? <Text style={styles.err}>Invalid postcode.</Text> : null}
              </View>
            </View>
            <Field label="Date of birth" hint="(DD/MM/YYYY)"><Input onDark value={dob} onChangeText={(v) => setDob(formatDob(v))} placeholder="21/04/1996" keyboardType="number-pad" maxLength={10} /></Field>
            {dob.length > 0 && !dobOk ? <Text style={styles.err}>Enter a valid date (DD/MM/YYYY), age 16+.</Text> : null}
          </>
        ) : null}

        {/* CANDIDATE — STEP 1 */}
        {isReg && step === 1 ? (
          <>
            <Field label="Sectors you'll work in">
              <View style={styles.chips}>
                {SECTORS.map((s) => {
                  const on = sectors.includes(s);
                  return (
                    <Pressable key={s} onPress={() => toggleSector(s)} style={[styles.chip, on && styles.chipOn]}>
                      {on ? <Icon name="check" size={12} color="#fff" /> : null}
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="Preferred role" hint="(optional)"><Input onDark value={prefRole} onChangeText={setPrefRole} placeholder="e.g. Warehouse Operative" /></Field>
            <Field label="Work pattern" hint="sets your starting availability — refine it any time">
              <Seg options={['Full-time', 'Part-time', 'Weekends']} value={avail} onChange={setAvail} />
            </Field>
          </>
        ) : null}

        {/* CANDIDATE — STEP 2 */}
        {isReg && step === 2 ? (
          <>
            <Field label="Right to work in the UK">
              <Seg options={['UK citizen', 'Settled', 'Visa']} value={rtw} onChange={setRtw} />
            </Field>
            <Field label="National Insurance no." hint="(optional)"><Input onDark value={ni} onChangeText={setNi} placeholder="QQ 12 34 56 C" autoCapitalize="characters" /></Field>
            <Field label="Create password"><Input onDark value={password} onChangeText={setPassword} placeholder="At least 4 characters" secureTextEntry /></Field>
            <View style={styles.info}>
              <Icon name="shield-lock" size={18} color={colors.orange} />
              <Text style={styles.infoText}>Next: review our agreements and add your <Text style={{ fontWeight: '800', color: '#fff' }}>e-signature</Text> to complete registration.</Text>
            </View>
          </>
        ) : null}

        {/* CANDIDATE — STEP 3 */}
        {isReg && step === 3 ? (
          <>
            <Text style={styles.fieldLabel}>AGREEMENTS</Text>
            <View style={{ gap: 13, marginTop: 4, marginBottom: 16 }}>
              <AgreeRow on={terms} set={setTerms} onRead={() => setViewDoc('terms')}>I accept Starff’s <Text style={styles.b}>Terms &amp; Conditions</Text> of engagement.</AgreeRow>
              <AgreeRow on={privacy} set={setPrivacy} onRead={() => setViewDoc('privacy')}>I have read the <Text style={styles.b}>Privacy Policy</Text>.</AgreeRow>
              <AgreeRow on={gdpr} set={setGdpr} onRead={() => setViewDoc('gdpr')}>I give explicit <Text style={styles.b}>GDPR consent</Text> for identity, right-to-work &amp; DBS checks.</AgreeRow>
              <AgreeRow on={alerts} set={setAlerts}>Send me matching shift alerts <Text style={{ color: '#8FA1BC' }}>(optional)</Text>.</AgreeRow>
            </View>
            <Text style={styles.fieldLabel}>E-SIGNATURE</Text>
            <View style={{ marginTop: 6 }}>
              <SignaturePad onChange={setSigned} />
              <View style={styles.sigMeta}>
                <Text style={styles.sigMetaText}>Signed by <Text style={{ color: '#fff', fontWeight: '700' }}>{name.trim() || 'your name'}</Text></Text>
                <Text style={styles.sigMetaText}>Date <Text style={{ color: '#fff', fontWeight: '700' }}>{today}</Text></Text>
              </View>
            </View>
            <View style={[styles.info, { marginTop: 14 }]}>
              <Icon name="writing-sign" size={18} color={colors.orange} />
              <Text style={styles.infoText}>Your signature is legally binding and confirms you agree to the documents above.</Text>
            </View>
          </>
        ) : null}

        <Button title={cta} onPress={advance} disabled={!ready} loading={busy} iconRight="arrow-right" style={{ marginTop: 10 }} />

        <Pressable style={styles.altRow} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.altText}>Already have an account?</Text>
          <Text style={styles.altLink}>Sign in</Text>
        </Pressable>
      </AuthShell>

      <DocSheet docKey={viewDoc} onClose={() => setViewDoc(null)} onAgree={(k) => { if (k === 'terms') setTerms(true); if (k === 'privacy') setPrivacy(true); if (k === 'gdpr') setGdpr(true); }} />
    </>
  );
}

function RoleOption({ on, icon, title, subtitle, onPress }: { on: boolean; icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.role, on && styles.roleOn]}>
      <View style={[styles.roleIc, on && { backgroundColor: colors.orange }]}>
        <Icon name={icon} size={22} color={on ? '#fff' : '#A9B6C9'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSub}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function Seg({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.segBtn, on && styles.segOn]}>
            <Text style={[styles.segText, on && { color: '#fff' }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AgreeRow({ on, set, onRead, children }: { on: boolean; set: (v: boolean) => void; onRead?: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.agree}>
      <Pressable onPress={() => set(!on)} style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={13} color="#fff" /> : null}
      </Pressable>
      <Text style={styles.agreeText} onPress={() => set(!on)}>
        {children}
        {onRead ? <Text style={styles.readLink} onPress={onRead}>  Read</Text> : null}
      </Text>
    </View>
  );
}

function DocSheet({ docKey, onClose, onAgree }: { docKey: string | null; onClose: () => void; onAgree: (k: string) => void }) {
  const insets = useSafeAreaInsets();
  const d = docKey ? LEGAL[docKey] : null;
  return (
    <Modal visible={!!d} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.docOverlay}>
        <View style={[styles.docSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.docHead}>
            <Text style={styles.docTitle}>{d?.title}</Text>
            <Pressable onPress={onClose} style={styles.docClose}><Icon name="x" size={18} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.docUpdated}>{d?.updated}</Text>
            {d?.body.map((s, i) => (
              <View key={i}>
                <Text style={styles.docH}>{s[0]}</Text>
                <Text style={styles.docP}>{s[1]}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.docFoot}>
            <Button title={`I agree to the ${d?.title}`} icon="check" onPress={() => { if (docKey) onAgree(docKey); onClose(); }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  h1: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 12 },
  sub: { color: '#A9B6C9', fontSize: 13.5, marginTop: 7, marginBottom: 16 },
  steps: { flexDirection: 'row', gap: 5, marginBottom: 18 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  barOn: { backgroundColor: colors.orange },
  barCur: { backgroundColor: colors.orange, opacity: 0.5 },
  roleSeg: { gap: 12, marginBottom: 18 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)' },
  roleOn: { borderColor: colors.orange, backgroundColor: 'rgba(244,122,32,0.12)' },
  roleIc: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  roleTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roleSub: { color: '#A9B6C9', fontSize: 12, marginTop: 2 },
  row2: { flexDirection: 'row', gap: 11 },
  err: { color: '#FCA5A5', fontSize: 12, marginTop: 4, marginBottom: 4, marginLeft: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.chip, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#C7D1E0' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.control, padding: 4, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.chip },
  segOn: { backgroundColor: colors.orange },
  segText: { fontSize: 12.5, fontWeight: '700', color: '#A9B6C9' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#A9B6C9', textTransform: 'uppercase', letterSpacing: 0.4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(244,122,32,0.12)', borderColor: 'rgba(244,122,32,0.35)', borderWidth: 1, borderRadius: radius.control, padding: 12 },
  infoText: { flex: 1, color: '#E6ECF5', fontSize: 12, lineHeight: 17 },
  b: { fontWeight: '800', color: '#fff' },
  agree: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  agreeText: { flex: 1, color: '#E6ECF5', fontSize: 12.5, lineHeight: 18 },
  readLink: { color: colors.orange, fontWeight: '700' },
  sigMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sigMetaText: { color: '#A9B6C9', fontSize: 11 },
  altRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16 },
  altText: { color: '#A9B6C9', fontSize: 13 },
  altLink: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  docOverlay: { flex: 1, backgroundColor: 'rgba(11,31,58,0.45)', justifyContent: 'flex-end' },
  docSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '86%' },
  docHead: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  docTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  docClose: { width: 32, height: 32, borderRadius: 999, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  docUpdated: { fontSize: 11, color: colors.textFaint, fontWeight: '600', marginBottom: 8 },
  docH: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 15, marginBottom: 5 },
  docP: { fontSize: 12.5, lineHeight: 20, color: colors.textMuted },
  docFoot: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
