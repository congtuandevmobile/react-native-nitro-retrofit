import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  lines: string[];
}

export function LogBox({ lines }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Log (latest first)</Text>
      <ScrollView>
        {lines.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 200, backgroundColor: '#1c1c1e', padding: 10 },
  title: { color: '#8e8e93', fontSize: 11, marginBottom: 4 },
  line: {
    color: '#e5e5e7',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
});
