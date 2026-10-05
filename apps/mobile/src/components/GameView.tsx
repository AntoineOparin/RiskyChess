import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { chipDelta, previewOdds } from '@risky-chess/engine';
import { CLASSIC_RULES, type Color, type GameRules, type ModeState, type MoveInput, type TurnExtras, type TurnResult, type Wallet, type GameOutcome } from '@risky-chess/shared';
import { useMoveSelection } from '../hooks/useMoveSelection';
import { describeEffects } from '../lib/effects';
import { activeUi } from '../modes/registry';
import type { BetOutcome, BetRequest, TableCtx } from '../modes/types';
import { cleanExtras, useModeExtras } from '../state/modeExtras';
import { useTurnPresenter } from '../hooks/useTurnPresenter';
import { describeOutcome, materialSummary, other } from '../lib/chess';
import { haptics } from '../lib/haptics';
import { moveSfx, playSfx } from '../lib/sfx';
import { colors } from '../lib/theme';
import { Board, type Marker } from './Board/Board';
import { BoardOverlay } from './Board/BoardOverlay';
import { TossReveal } from './Board/TossReveal';
import { EffectsFeed } from './EffectsFeed';
import { FairBadge } from './FairBadge';
import { ModePanelZone } from './ModePanelZone';
import { MoveSlotBar } from './MoveSlotBar';
import { OddsBadge } from './OddsBadge';
import { PlayerBar } from './PlayerBar';
import { PromotionPicker } from './PromotionPicker';
import { RulesSheet } from './RulesSheet';

/** The table's mode setup, from the viewer's side. Omitted for a classic game. */
export interface TableInfo {
  gameId: string;
  rules: GameRules;
  wallet?: Wallet | undefined;
  modeState: ModeState;
  turnNumber: number;
  online: boolean;
  placeBet?: (req: BetRequest) => Promise<BetOutcome>;
}

export interface GameViewProps {
  /** Authoritative current position. */
  fen: string;
  myColor: Color;
  history: TurnResult[];
  /** True when the game is waiting on this player's submission. */
  myTurn: boolean;
  outcome?: GameOutcome | undefined;
  names: { me: string; opponent: string };
  banner?: string | null;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (moveA: MoveInput, moveB: MoveInput | null, extras?: TurnExtras) => void;
  onResign: () => void;
  table?: TableInfo;
  /** Opens the per-turn fairness ledger (online games). */
  onOpenFairness?: () => void;
  /** Shown once the game is over and the final reveal has finished. */
  outcomeAction?: { label: string; onPress: () => void };
}

const marker = (m: { from: Marker['from']; to: Marker['to'] } | null | undefined): Marker | null =>
  m ? { from: m.from, to: m.to } : null;

/**
 * Shared board screen for offline and online games. New turn results are
 * revealed one at a time on the board; it shows each turn's starting position
 * until its reveal ends. Tapping the board during a reveal skips it.
 */
export function GameView({ fen, myColor, history, myTurn, outcome, names, banner, submitting = false, error, onSubmit, onResign, outcomeAction, table, onOpenFairness }: GameViewProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 480);
  const cell = size / 8;

  const { current: revealing, done, settledOutcome, lastShown } = useTurnPresenter(history, outcome);
  const displayFen = revealing ? revealing.fenBefore : fen;
  const canAct = myTurn && !revealing && !outcome;
  const sel = useMoveSelection(displayFen, canAct && !submitting);
  // From the displayed position, so the count updates when a reveal lands, never before.
  const material = useMemo(() => materialSummary(displayFen), [displayFen]);
  const oppColor = other(myColor);
  const rules = table?.rules ?? CLASSIC_RULES;
  const [rulesOpen, setRulesOpen] = useState(false);

  // Mode inputs for the next submission; every new position starts clean.
  const extras = useModeExtras((s) => s.extras);
  const setExtras = useModeExtras((s) => s.set);
  useEffect(() => useModeExtras.getState().reset(), [displayFen]);

  // Chips as of what has been revealed: turns still queued for a reveal are not counted yet.
  const shownWallet = useMemo(() => {
    const w = table?.wallet;
    if (!w || !revealing) return w;
    const d = chipDelta(history.slice(history.indexOf(revealing)).flatMap((r) => r.effects ?? []));
    return { w: w.w - d.w, b: w.b - d.b };
  }, [table?.wallet, revealing, history]);

  // The line the current pair would be tossed at: the same engine pipeline the server runs.
  const odds = useMemo(() => {
    if (!table || !canAct || !sel.slots.A || (!sel.slots.B && !extras.allIn)) return null;
    const p = previewOdds({
      gameId: table.gameId,
      turnNumber: table.turnNumber,
      fen: displayFen,
      previousFens: [],
      moveA: sel.slots.A,
      moveB: extras.allIn ? null : sel.slots.B,
      rules: table.rules,
      ...(table.wallet ? { wallet: table.wallet } : {}),
      modeState: table.modeState,
      extras,
      history,
    });
    return p.ok ? p.odds : null;
  }, [table, canAct, sel.slots, extras, displayFen, history]);

  const ctx: TableCtx = useMemo(
    () => ({
      fen: displayFen,
      myColor,
      rules,
      ...(shownWallet ? { wallet: shownWallet } : {}),
      modeState: table?.modeState ?? {},
      history,
      turnNumber: table?.turnNumber ?? history.length + 1,
      canAct: canAct && !submitting,
      slots: sel.slots,
      extras,
      setExtras,
      odds,
      online: table?.online ?? false,
      finished: !!settledOutcome,
      ...(table?.placeBet ? { placeBet: table.placeBet } : {}),
    }),
    [displayFen, myColor, rules, shownWallet, table, history, canAct, submitting, sel.slots, extras, setExtras, odds, settledOutcome],
  );
  const modes = activeUi(rules.modes);
  const badgeModes = modes.filter(([, ui]) => ui.SlotBadge);
  const accessory = (color: Color) =>
    modes
      .filter(([, ui]) => ui.PlayerAccessory)
      .map(([id, ui]) => {
        const Accessory = ui.PlayerAccessory!;
        return <Accessory key={id} ctx={ctx} color={color} />;
      });

  // Effect toasts once a reveal settles, only for turns revealed while this screen is open.
  const firstLive = useRef(history.at(-1)?.turnNumber ?? 0);
  const feedTurn = !revealing && lastShown && lastShown.turnNumber > firstLive.current ? lastShown : null;
  const feedLines = useMemo(() => (feedTurn ? describeEffects(feedTurn.effects ?? [], rules, myColor) : []), [feedTurn, rules, myColor]);

  const skip = useCallback(() => {
    if (!revealing) return;
    playSfx(moveSfx(revealing));
    done();
  }, [revealing, done]);

  // Game-over stinger, once, when the final reveal settles (not when reopening a finished game).
  const announced = useRef(settledOutcome !== undefined);
  useEffect(() => {
    if (!settledOutcome || announced.current) return;
    announced.current = true;
    const won = 'winner' in settledOutcome ? settledOutcome.winner === myColor : null;
    playSfx(won === null ? 'draw' : won ? 'win' : 'lose');
    if (won === null) haptics.warning();
    else if (won) haptics.success();
    else haptics.error();
  }, [settledOutcome, myColor]);
  useEffect(() => {
    if (!outcome) announced.current = false; // restarted
  }, [outcome]);

  // Memoized so unrelated re-renders (store updates mid-reveal, banners) don't
  // hand the memoized Board / BoardOverlay fresh objects.
  const lastMove = useMemo(() => marker(lastShown?.executed), [lastShown]);
  // The candidate the coin rejected last turn, left on the board as a faint arrow.
  const ghost = useMemo(() => {
    if (!lastShown?.coin || !lastShown.moveB) return null;
    const slot = lastShown.coin.chosen === 'A' ? ('B' as const) : ('A' as const);
    const move = slot === 'A' ? lastShown.moveA : lastShown.moveB;
    return { slot, move: { from: move.from, to: move.to } };
  }, [lastShown]);
  const slotMarkers = useMemo(
    () => (canAct ? { A: marker(sel.slots.A), B: marker(sel.slots.B) } : {}),
    [canAct, sel.slots],
  );

  const status = (() => {
    if (revealing) return revealing.forced ? 'Forced move' : revealing.mover === myColor ? 'Tossing your coin…' : 'Tossing their coin…';
    if (settledOutcome) return describeOutcome(settledOutcome, myColor);
    if (banner) return banner;
    if (submitting) return 'Locked in';
    if (myTurn) return sel.forced ? 'Your move (forced)' : 'Your move: choose two candidates';
    return `${names.opponent} is choosing…`;
  })();

  const confirmResign = () =>
    Alert.alert('Resign?', 'This ends the game as a loss.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resign', style: 'destructive', onPress: onResign },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PlayerBar
        name={names.opponent}
        captured={material[oppColor].captured}
        capturedColor={myColor}
        score={material[oppColor].score}
        chips={shownWallet?.[oppColor]}
        accessory={accessory(oppColor)}
      />
      <View style={{ width: size, height: size }}>
        <Board
          fen={displayFen}
          orientation={myColor}
          size={size}
          selected={sel.from}
          targets={sel.targets}
          takenTargets={sel.takenTargets}
          lastMove={lastMove}
          onSquarePress={revealing ? skip : sel.onSquarePress}
        />
        {revealing ? (
          <TossReveal
            key={`${revealing.gameId}:${revealing.turnNumber}`}
            result={revealing}
            orientation={myColor}
            cell={cell}
            mine={revealing.mover === myColor}
            onDone={done}
          />
        ) : (
          <BoardOverlay
            orientation={myColor}
            cell={cell}
            slots={slotMarkers}
            ghost={canAct && (sel.slots.A || sel.slots.B) ? null : ghost}
          />
        )}
      </View>
      <PlayerBar
        name={names.me}
        captured={material[myColor].captured}
        capturedColor={oppColor}
        score={material[myColor].score}
        chips={shownWallet?.[myColor]}
        accessory={accessory(myColor)}
      />

      <View style={styles.statusRow}>
        <Text style={[styles.status, settledOutcome && styles.outcome]}>{status}</Text>
        <Pressable onPress={() => setRulesOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Table rules" style={styles.help}>
          <Text style={styles.helpText}>?</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <EffectsFeed feedKey={feedTurn ? `${feedTurn.gameId}:${feedTurn.turnNumber}` : null} lines={feedLines} />
      {!settledOutcome && <ModePanelZone ctx={ctx} />}

      {!settledOutcome && (
        <MoveSlotBar
          slots={sel.slots}
          armed={sel.armed}
          filled={sel.filled}
          rejected={sel.rejected}
          forced={sel.forced && canAct}
          active={canAct}
          canSubmit={canAct && sel.submission !== null}
          locked={submitting}
          onArm={sel.arm}
          onClear={sel.clear}
          onSubmit={() => sel.submission && onSubmit(sel.submission.moveA, sel.submission.moveB, cleanExtras(extras))}
          badge={(slot) =>
            badgeModes.length ? (
              badgeModes.map(([id, ui]) => {
                const B = ui.SlotBadge!;
                return <B key={id} ctx={ctx} slot={slot} />;
              })
            ) : (
              <OddsBadge odds={odds} slot={slot} />
            )
          }
        />
      )}
      {lastShown && !lastShown.forced && (
        <View style={styles.lastRow}>
          <Text style={styles.lastTurn}>
            Last toss: {lastShown.moveA.san} vs {lastShown.moveB?.san ?? 'All-In'} → {lastShown.coin?.chosen} ({lastShown.executed.san})
            {lastShown.odds && lastShown.odds.A !== 5000 ? ` at ${Math.round(lastShown.odds.A / 100)}/${100 - Math.round(lastShown.odds.A / 100)}` : ''}
          </Text>
          <FairBadge result={lastShown} onPress={onOpenFairness} />
        </View>
      )}
      {settledOutcome &&
        modes
          .filter(([, ui]) => ui.GameOverCard)
          .map(([id, ui]) => {
            const Card = ui.GameOverCard!;
            return <Card key={id} ctx={ctx} />;
          })}
      {settledOutcome && outcomeAction && (
        <Pressable onPress={outcomeAction.onPress} style={styles.action}>
          <Text style={styles.actionText}>{outcomeAction.label}</Text>
        </Pressable>
      )}
      {!settledOutcome && !outcome && (
        <Pressable onPress={confirmResign} style={styles.resign}>
          <Text style={styles.resignText}>Resign</Text>
        </Pressable>
      )}
      <PromotionPicker visible={sel.pendingPromotion !== null} color={myColor} onPick={sel.choosePromotion} />
      <RulesSheet visible={rulesOpen} rules={rules} onClose={() => setRulesOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, alignItems: 'stretch' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, minHeight: 26 },
  status: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  outcome: { fontSize: 20, color: colors.slotA },
  error: { color: colors.danger, textAlign: 'center' },
  resign: { alignSelf: 'center', padding: 8 },
  resignText: { color: colors.danger, fontWeight: '600' },
  lastTurn: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
  lastRow: { gap: 2, alignItems: 'center' },
  help: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
  action: { backgroundColor: colors.slotA, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#111', fontWeight: '800', fontSize: 17 },
});
