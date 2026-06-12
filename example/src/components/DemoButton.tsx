import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  color?: string;
}

export function DemoButton({ label, onPress, color = '#007AFF' }: Props) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color }]}
      onPress={onPress}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 10, padding: 14 },
  text: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
