import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, colors, radius } from '../../lib/theme';

export interface TileProps {
  title: string;
  subtitle?: string;
  /** A big glyph or emoji. */
  glyph: string;
  onPress: () => void;
  tone?: 'gold' | 'blue' | 'green' | 'red';
  badge?: string;
}

const TONE = { gold: accent.gold, blue: accent.blue, green: accent.green, red: accent.red } as const;

/** A casino home tile: glyph, name, one-line pitch, coloured stripe. */
export function Tile({ title, subtitle, glyph, onPress, tone = 'gold', badge }: TileProps) {
  const color = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ''}${badge ? `. ${badge}` : ''}`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.head}>
        <Text style={styles.glyph} accessibilityElementsHidden>
          {glyph}
        </Text>
        {badge ? (
          <View style={[styles.badge, { borderColor: color }]}>
            <Text style={[styles.badgeText, { color }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 140, minHeight: 120, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 4, overflow: 'hidden' },
  stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  glyph: { fontSize: 28 },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 6 },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.85 },
});
