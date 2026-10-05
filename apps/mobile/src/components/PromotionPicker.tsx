import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Color, PromotionPiece } from '@risky-chess/shared';
import { colors } from '../lib/theme';
import { Piece } from './Board/Piece';

const OPTIONS: PromotionPiece[] = ['q', 'r', 'b', 'n'];

export function PromotionPicker({ visible, color, onPick }: { visible: boolean; color: Color; onPick: (p: PromotionPiece | null) => void }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => onPick(null)}>
      <Pressable style={styles.backdrop} onPress={() => onPick(null)}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Promote to</Text>
          <View style={styles.row}>
            {OPTIONS.map((p) => (
              <Pressable key={p} onPress={() => onPick(p)} style={styles.option} accessibilityLabel={`Promote to ${p}`}>
                <Piece type={p} color={color} size={56} />
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 16, gap: 12 },
  title: { color: colors.text, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  option: { backgroundColor: colors.lightSquare, borderRadius: 8 },
});
