import { StyleSheet, View } from 'react-native';
import { activeUi } from '../modes/registry';
import type { TableCtx } from '../modes/types';

/**
 * The one zone where mode controls live, between the status row and the slot
 * bar, so the board never moves. Each active mode's panel stacks here.
 */
export function ModePanelZone({ ctx }: { ctx: TableCtx }) {
  const panels = activeUi(ctx.rules.modes).filter(([, ui]) => ui.Panel);
  if (!panels.length) return null;
  return (
    <View style={styles.zone}>
      {panels.map(([id, ui]) => {
        const Panel = ui.Panel!;
        return (
          <View key={id} style={styles.panel}>
            <Panel ctx={ctx} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { gap: 6 },
  panel: { maxHeight: 56, justifyContent: 'center' },
});
