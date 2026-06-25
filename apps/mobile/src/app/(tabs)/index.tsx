import { Counter } from '@/components/Counter';
import { View, Text } from 'react-native';

export default function Tab() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Counter />
    </View>
  );
}