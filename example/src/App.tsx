/**
 * Bootstrap network before anything else.
 * See src/network/index.ts to switch between NitroRetrofitClient and AxiosRetrofitAdapter.
 */
import './network';

import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { LogBox } from './components/LogBox';
import { GetScreen } from './screens/GetScreen';
import { InterceptorScreen } from './screens/InterceptorScreen';
import { MultipartScreen } from './screens/MultipartScreen';
import { MutateScreen } from './screens/MutateScreen';

type TabKey = 'GET' | 'MUTATE' | 'MULTIPART' | 'INTERCEPT';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'GET', label: 'GET' },
  { key: 'MUTATE', label: 'POST/PUT/DEL' },
  { key: 'MULTIPART', label: 'MULTIPART' },
  { key: 'INTERCEPT', label: 'INTERCEPT' },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>('GET');
  const [log, setLog] = useState<string[]>(['Ready.']);

  async function onLog(label: string, fn: () => Promise<Response>) {
    setLog((prev) => [`▶ ${label} …`, ...prev.slice(0, 19)]);
    try {
      const res = await fn();
      const ct = res.headers.get('content-type') ?? '';
      const body = ct.includes('application/json')
        ? JSON.stringify(await res.json()).slice(0, 100)
        : (await res.text()).slice(0, 100);
      setLog((prev) => [
        `✓ ${label} [${res.status}]  ${body}`,
        ...prev.slice(0, 19),
      ]);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setLog((prev) => [`✗ ${label}  ${msg}`, ...prev.slice(0, 19)]);
      Alert.alert('Error', msg);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text
              style={[styles.tabLabel, tab === key && styles.tabLabelActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.screen}>
        {tab === 'GET' && <GetScreen onLog={onLog} />}
        {tab === 'MUTATE' && <MutateScreen onLog={onLog} />}
        {tab === 'MULTIPART' && <MultipartScreen onLog={onLog} />}
        {tab === 'INTERCEPT' && <InterceptorScreen onLog={onLog} />}
      </View>

      <LogBox lines={log} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f7' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    paddingTop: 52,
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabLabel: { color: '#8e8e93', fontSize: 11, fontWeight: '600' },
  tabLabelActive: { color: '#007AFF' },
  screen: { flex: 1 },
});
