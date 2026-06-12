import { ScrollView, StyleSheet, Text } from 'react-native';

import { DemoButton } from '../components/DemoButton';
import { postService } from '../services/post.service';

interface Props {
  onLog: (label: string, fn: () => Promise<Response>) => void;
}

export function InterceptorScreen({ onLog }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.note}>
        A <Text style={styles.code}>request interceptor</Text> injects{'\n'}
        <Text style={styles.code}>Authorization: Bearer demo-token-abc123</Text>
        {'\n'}on every call (check network inspector).{'\n\n'}A{' '}
        <Text style={styles.code}>response interceptor</Text> logs any non-2xx
        status to the console.
      </Text>

      <DemoButton
        label="getById(999) → 404 — logged by response interceptor"
        onPress={() => onLog('getById(999)', () => postService.getById(999))}
        color="#FF9500"
      />
      <DemoButton
        label="list(3, 1) — check Authorization header"
        onPress={() => onLog('list(3,1)', () => postService.list(3, 1))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  note: { color: '#555', fontSize: 13, lineHeight: 20 },
  code: { fontFamily: 'monospace', backgroundColor: '#e8e8e8' },
});
