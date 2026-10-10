import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MAX_CONTENT_WIDTH } from '../../lib/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap in a ScrollView. */
  scroll?: boolean;
  /** 16px side padding (default on). */
  padded?: boolean;
  /**
   * Which device insets to pad for. Screens under a navigation header only
   * need the bottom (home indicator); tab screens draw their own header and
   * need the top (notch) but the tab bar already covers the bottom.
   */
  safe?: 'top' | 'bottom' | 'both' | 'none';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** The page wrapper: app background, safe-area padding, content capped at MAX_CONTENT_WIDTH and centred. */
export function Screen({ children, scroll = false, padded = true, safe = 'bottom', style, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pad = padded ? 16 : 0;
  const edges: ViewStyle = {
    paddingTop: pad + (safe === 'top' || safe === 'both' ? insets.top : 0),
    paddingBottom: pad + (safe === 'bottom' || safe === 'both' ? insets.bottom : 0),
    paddingLeft: pad + insets.left,
    paddingRight: pad + insets.right,
  };
  const inner = [styles.content, edges, contentStyle];
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
});
