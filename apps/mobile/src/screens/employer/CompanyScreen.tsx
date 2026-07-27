import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Field,
  Input,
  Button,
  Muted,
  Pill,
  SecHead,
  LoadingState,
  ErrorState,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { clientApi } from '@/lib/endpoints';

interface Location { id: string; name: string; address: string; workers: number }
interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  isPrimary: boolean;
}

/**
 * Company setup — profile, hiring locations, authorised users and the terms +
 * e-signature. All wired to the existing /client/{profile,locations,contacts,
 * agreement} endpoints (the same the web client portal's "Company Setup" uses).
 */
export function EmployerCompanyScreen() {
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agreement, setAgreement] = useState(false);
  const [signature, setSignature] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAgreement, setSavingAgreement] = useState(false);

  // New location / contact drafts
  const [locName, setLocName] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locPostcode, setLocPostcode] = useState('');
  const [ctName, setCtName] = useState('');
  const [ctEmail, setCtEmail] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, locs, cts] = await Promise.all([
        clientApi.me() as Promise<any>,
        clientApi.locations() as Promise<Location[]>,
        clientApi.contacts() as Promise<Contact[]>,
      ]);
      const c = me.client ?? {};
      setProfile({
        name: c.name ?? '',
        industry: c.industry ?? '',
        companyRegNo: c.companyRegNo ?? '',
        addressLine1: c.addressLine1 ?? '',
        city: c.city ?? '',
        postcode: c.postcode ?? '',
        billingEmail: c.billingEmail ?? '',
      });
      setAgreement(!!c.agreementAccepted);
      setSignature(c.signatureName ?? '');
      setLocations(locs);
      setContacts(cts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setP = (k: string) => (v: string) => setProfile((p) => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await clientApi.updateProfile(profile);
      Alert.alert('Saved', 'Company profile updated.');
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const addLocation = async () => {
    if (!locName.trim()) return;
    try {
      await clientApi.addLocation({
        name: locName.trim(),
        city: locCity.trim() || undefined,
        postcode: locPostcode.trim() || undefined,
      });
      setLocName(''); setLocCity(''); setLocPostcode('');
      load();
    } catch (err) {
      Alert.alert('Could not add', (err as Error).message);
    }
  };
  const removeLocation = async (id: string) => {
    try { await clientApi.removeLocation(id); load(); }
    catch (err) { Alert.alert('Could not remove', (err as Error).message); }
  };

  const addContact = async () => {
    const [firstName, ...rest] = ctName.trim().split(' ');
    if (!firstName || !ctEmail.includes('@')) return;
    try {
      await clientApi.addContact({ firstName, lastName: rest.join(' '), email: ctEmail.trim() });
      setCtName(''); setCtEmail('');
      load();
    } catch (err) {
      Alert.alert('Could not add', (err as Error).message);
    }
  };
  const removeContact = async (id: string) => {
    try { await clientApi.removeContact(id); load(); }
    catch (err) { Alert.alert('Could not remove', (err as Error).message); }
  };

  const saveAgreement = async () => {
    if (!agreement || signature.trim().length < 2) return;
    setSavingAgreement(true);
    try {
      await clientApi.setAgreement({ agreementAccepted: true, signatureName: signature.trim() });
      Alert.alert('Signed', 'Your agreement and signature were recorded.');
      load();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSavingAgreement(false);
    }
  };

  if (loading)
    return (
      <View style={styles.root}>
        <AppBar title="Company setup" onBack={() => nav.goBack()} />
        <LoadingState />
      </View>
    );
  if (error)
    return (
      <View style={styles.root}>
        <AppBar title="Company setup" onBack={() => nav.goBack()} />
        <ErrorState message={error} onRetry={load} />
      </View>
    );

  return (
    <View style={styles.root}>
      <AppBar title="Company setup" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {/* Profile */}
        <Card>
          <Text style={styles.section}>Company profile</Text>
          <Field label="Company name"><Input value={profile.name} onChangeText={setP('name')} /></Field>
          <Field label="Industry"><Input value={profile.industry} onChangeText={setP('industry')} placeholder="Logistics" /></Field>
          <Field label="Companies House no." hint="(optional)"><Input value={profile.companyRegNo} onChangeText={setP('companyRegNo')} /></Field>
          <Field label="Address"><Input value={profile.addressLine1} onChangeText={setP('addressLine1')} /></Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label="City"><Input value={profile.city} onChangeText={setP('city')} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Postcode"><Input value={profile.postcode} onChangeText={setP('postcode')} /></Field></View>
          </View>
          <Field label="Billing email"><Input value={profile.billingEmail} onChangeText={setP('billingEmail')} autoCapitalize="none" keyboardType="email-address" /></Field>
          <Button title="Save profile" onPress={saveProfile} loading={savingProfile} />
        </Card>

        {/* Locations */}
        <SecHead title="Hiring locations" />
        <Card tight>
          {locations.length === 0 ? <Muted>No sites yet.</Muted> : locations.map((l) => (
            <View key={l.id} style={styles.li}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liTitle}>{l.name}</Text>
                <Muted>{l.address || 'No address'}</Muted>
              </View>
              <Pressable onPress={() => removeLocation(l.id)} hitSlop={8}>
                <Icon name="x" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addBox}>
            <Input value={locName} onChangeText={setLocName} placeholder="Site name (e.g. Dagenham Depot)" />
            <View style={[styles.row, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}><Input value={locCity} onChangeText={setLocCity} placeholder="City" /></View>
              <View style={{ flex: 1 }}><Input value={locPostcode} onChangeText={setLocPostcode} placeholder="Postcode" /></View>
            </View>
            <Button title="Add location" kind="ghost" icon="plus" onPress={addLocation} style={{ marginTop: 8 }} />
          </View>
        </Card>

        {/* Authorised users */}
        <SecHead title="Authorised users" />
        <Card tight>
          {contacts.map((c) => (
            <View key={c.id} style={styles.li}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liTitle}>{c.firstName} {c.lastName}</Text>
                <Muted>{c.email}</Muted>
              </View>
              {c.isPrimary ? <Pill kind="blue">Primary</Pill> : (
                <Pressable onPress={() => removeContact(c.id)} hitSlop={8}>
                  <Icon name="x" size={18} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
          <View style={styles.addBox}>
            <Input value={ctName} onChangeText={setCtName} placeholder="Full name" />
            <Input value={ctEmail} onChangeText={setCtEmail} placeholder="Work email" autoCapitalize="none" keyboardType="email-address" style={{ marginTop: 8 }} />
            <Button title="Add user" kind="ghost" icon="plus" onPress={addContact} style={{ marginTop: 8 }} />
          </View>
        </Card>

        {/* Agreement */}
        <SecHead title="Terms & signature" />
        <Card>
          <Pressable style={styles.consent} onPress={() => setAgreement(!agreement)}>
            <View style={[styles.check, agreement && styles.checkOn]}>
              {agreement ? <Icon name="check" size={13} color="#fff" /> : null}
            </View>
            <Text style={styles.consentText}>
              I accept Starff's <Text style={{ fontWeight: '800' }}>Terms of Business</Text> and confirm I'm authorised to sign for the company.
            </Text>
          </Pressable>
          <Field label="E-signature" hint="(type your full name)">
            <Input value={signature} onChangeText={setSignature} placeholder="Rachel Turner" />
          </Field>
          <Text style={styles.sig}>{signature.trim() || 'Your signature'}</Text>
          <Button title="Save & sign" onPress={saveAgreement} disabled={!agreement || signature.trim().length < 2} loading={savingAgreement} />
        </Card>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 11 },
  li: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  liTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  addBox: { marginTop: 12 },
  consent: { flexDirection: 'row', gap: 11, marginBottom: 14, alignItems: 'flex-start' },
  check: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  consentText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.text },
  sig: {
    fontSize: 24, fontStyle: 'italic', color: colors.text, paddingVertical: 12,
    borderBottomWidth: 1.5, borderBottomColor: colors.borderStrong, marginBottom: 12,
  },
});
