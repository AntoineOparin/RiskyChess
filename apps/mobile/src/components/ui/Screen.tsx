import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, MAX_CONTENT_WIDTH } from '../../lib/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap in a ScrollView. */
  scroll?: boolean;
  /** 16px side padding (default on). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** The page wrapper: app background, content capped at MAX_CONTENT_WIDTH and centred. */
export function Screen({ children, scroll = false, padded = true, style, contentStyle }: ScreenProps) {
  const inner = [styles.content, padded && styles.padded, contentStyle];
  if (scroll) {
    return (
      <ScrollView style={[styles.page, style]} contentContainerStyle={[styles.scrollBody, ...inner]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.page, style]}>
      <View style={[styles.fill, ...inner]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  scrollBody: { flexGrow: 1 },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 12 },
  padded: { padding: 16 },
});
