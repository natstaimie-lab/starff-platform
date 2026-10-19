import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, Muted, LoadingState, ErrorState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi, WorkerDoc } from '@/lib/endpoints';

/** The three worker documents (Terms of Engagement, Key Information Document,
 *  48-hour opt-out). Read, then e-sign — mirrors the client Terms of Business.
 *  GET /me/documents/terms · POST /me/documents/:key/accept|decline. */
export function WorkerDocumentsScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, reload } = useApi(() => candidateApi.workerDocuments(), []);
  const docs = (data?.documents ?? []) as WorkerDoc[];

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sig, setSig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const accept = async (doc: WorkerDoc) => {
    const name = (sig[doc.key] ?? '').trim();
    if (name.length < 2) { Alert.alert('Signature needed', 'Type your full name to sign.'); return; }
    setBusy(doc.key);
    try {
      await candidateApi.acceptDocument(doc.key, name);
      setOpenKey(null);
      reload();
    } catch (err) {
      Alert.alert('Could not sign', (err as Error).message);
    } finally { setBusy(null); }
  };

  const decline = async (doc: WorkerDoc) => {
    setBusy(doc.key);
    try {
      await candidateApi.declineDocument(doc.key);
      reload();
    } catch (err) {
      Alert.alert('Could not update', (err as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Worker documents" subtitle="Read & sign" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <Muted style={{ marginBottom: 14, lineHeight: 18 }}>
              These documents cover how Starff works with you and pays you. Please read each one and
              sign. The 48-hour opt-out is optional — signing is always your choice.
            </Muted>
            {docs.map((doc) => (
              <DocCard
                key={doc.key}
                doc={doc}
                open={openKey === doc.key}
                busy={busy === doc.key}
                signature={sig[doc.key] ?? ''}
                fmt={fmt}
                onToggle={() => setOpenKey(openKey === doc.key ? null : doc.key)}
                onSign={(v) => setSig((s) => ({ ...s, [doc.key]: v }))}
                onAccept={() => accept(doc)}
                onDecline={() => decline(doc)}
              />
            ))}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function DocCard({
  doc, open, busy, signature, fmt, onToggle, onSign, onAccept, onDecline,
}: {
  doc: WorkerDoc;
  open: boolean;
  busy: boolean;
  signature: string;
  fmt: (s?: string | null) => string;
  onToggle: () => void;
  onSign: (v: string) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const s = doc.status;
  const statusText = s.accepted
    ? `Signed by ${s.signatureName} on ${fmt(s.acceptedAt)}${s.outdated ? ' · updated version available' : ''}`
    : s.declined
      ? 'Declined — you can sign any time'
      : doc.optional ? 'Not signed (your choice)' : 'Not signed yet';
  const statusColor = s.accepted ? colors.success : s.declined ? colors.textMuted : colors.warning;

  return (
    <Card style={{ marginBottom: 12 }}>
      <Pressable style={styles.head} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{doc.title}{doc.optional ? '  ·  optional' : ''}</Text>
          <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
        </View>
        <Icon name={open ? 'arrow-up' : 'chevron-right'} size={18} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={{ marginTop: 10 }}>
          <View style={styles.terms}>
            <Markdown text={doc.text} />
          </View>
          <Text style={styles.confirm}>{doc.confirmation}</Text>
          {!s.accepted ? (
            <>
              <Field label="E-signature" hint="(type your full name)">
                <Input value={signature} onChangeText={onSign} placeholder="Jamie Smith" />
              </Field>
              {signature.trim().length > 0 && <Text style={styles.sig}>{signature.trim()}</Text>}
              <Button title="Agree & sign" onPress={onAccept} loading={busy} disabled={signature.trim().length < 2} />
              {doc.optional && (
                <Pressable style={styles.decline} onPress={onDecline} disabled={busy}>
                  <Text style={styles.declineText}>Decline for now</Text>
                </Pressable>
              )}
            </>
          ) : (
            <View style={styles.signed}>
              <Icon name="circle-check" size={16} color={colors.success} />
              <Muted style={{ flex: 1 }}>You signed this. Starff keeps a copy on file.</Muted>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** Minimal renderer for the lightweight markdown the API serves. */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const out: { type: 'h1' | 'h2' | 'h3' | 'li' | 'row' | 'p'; a: string; b?: string }[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      if (!line) continue;
      if (line.startsWith('### ')) out.push({ type: 'h3', a: line.slice(4) });
      else if (line.startsWith('## ')) out.push({ type: 'h2', a: line.slice(3) });
      else if (line.startsWith('# ')) out.push({ type: 'h1', a: line.slice(2) });
      else if (line.startsWith('- ')) out.push({ type: 'li', a: line.slice(2) });
      else if (line.includes(' | ')) { const [a, b] = line.split(' | '); out.push({ type: 'row', a, b }); }
      else out.push({ type: 'p', a: line });
    }
    return out;
  }, [text]);

  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <Text key={i} style={styles.mdH1}>{b.a}</Text>;
        if (b.type === 'h2') return <Text key={i} style={styles.mdH2}>{b.a}</Text>;
        if (b.type === 'h3') return <Text key={i} style={styles.mdH3}>{b.a}</Text>;
        if (b.type === 'li') return <View key={i} style={styles.mdLiRow}><Text style={styles.mdBullet}>•</Text><Text style={styles.mdLi}>{b.a}</Text></View>;
        if (b.type === 'row') return <View key={i} style={styles.mdTableRow}><Text style={styles.mdCellKey}>{b.a}</Text><Text style={styles.mdCellVal}>{b.b}</Text></View>;
        return <Text key={i} style={styles.mdP}>{b.a}</Text>;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '800', color: colors.text },
  status: { fontSize: 11.5, marginTop: 3, lineHeight: 15 },
  terms: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: 12,
    backgroundColor: colors.surfaceAlt,
  },
  confirm: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginVertical: 12, lineHeight: 18 },
  sig: { fontSize: 22, fontStyle: 'italic', color: colors.text, paddingVertical: 8, marginBottom: 10 },
  decline: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  declineText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  signed: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  // markdown
  mdH1: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 },
  mdH2: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 3 },
  mdH3: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 2 },
  mdP: { fontSize: 12, lineHeight: 17, color: colors.text, marginBottom: 6 },
  mdLiRow: { flexDirection: 'row', gap: 6, marginBottom: 4, paddingRight: 6 },
  mdBullet: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  mdLi: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.text },
  mdTableRow: { flexDirection: 'row', gap: 8, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: colors.border },
  mdCellKey: { flex: 0.42, fontSize: 11.5, fontWeight: '700', color: colors.text },
  mdCellVal: { flex: 0.58, fontSize: 11.5, color: colors.text },
});
