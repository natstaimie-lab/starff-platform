import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, AIBox, Muted } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { clientApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';

/**
 * Book Staff — creates a job request via POST /client/jobs (the same endpoint
 * and fields the web client portal's "Book Staff" form uses: title, chargeRate,
 * payRate, openings). The booking appears immediately in the admin dashboard.
 */
export function EmployerPostScreen() {
  const [title, setTitle] = useState('');
  const [chargeRate, setChargeRate] = useState('');
  const [payRate, setPayRate] = useState('');
  const [openings, setOpenings] = useState('1');
  const [busy, setBusy] = useState(false);

  const valid =
    title.trim() && Number(chargeRate) > 0 && Number(payRate) > 0;

  const post = async () => {
    setBusy(true);
    try {
      await clientApi.createJob({
        title: title.trim(),
        chargeRate: Number(chargeRate),
        payRate: Number(payRate),
        openings: Number(openings) || 1,
      });
      Alert.alert('Role posted', 'Starff is matching vetted candidates now.');
      setTitle('');
      setChargeRate('');
      setPayRate('');
      setOpenings('1');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not post the role.';
      Alert.alert('Could not post', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Post a role" subtitle="Book vetted temporary staff" />
      <ScreenScroll>
        <Card>
          <Field label="Job title">
            <Input value={title} onChangeText={setTitle} placeholder="e.g. HGV Class 1 Driver" />
          </Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Charge rate £/hr" hint="(to you)">
                <Input
                  value={chargeRate}
                  onChangeText={setChargeRate}
                  placeholder="19.50"
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Pay rate £/hr" hint="(worker)">
                <Input
                  value={payRate}
                  onChangeText={setPayRate}
                  placeholder="13.50"
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
          </View>
          <Field label="Workers needed">
            <Input
              value={openings}
              onChangeText={setOpenings}
              placeholder="1"
              keyboardType="number-pad"
            />
          </Field>
          <Muted>
            Starff verifies right-to-work, DBS and licences on every worker before they
            arrive.
          </Muted>
        </Card>

        <AIBox label="AI optimiser">
          Starff AI matches vetted candidates and flags compliance gaps before you see a
          single CV.
        </AIBox>

        <Button title="Post role" onPress={post} disabled={!valid} loading={busy} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 11 },
});
