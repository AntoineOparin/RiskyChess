import { memo, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Color, MoveSlot, Square } from '@risky-chess/shared';
import { squareOrigin } from '../../lib/chess';
import { slotColor } from '../../lib/theme';

interface Props {
  from: Square;
  to: Square;
  slot: MoveSlot;
  orientation: Color;
  cell: number;
  /** Sideways shift in cells, so two arrows sharing a square don't overlap. */
  offset?: number;
  /** Animated opacity from a reveal; static arrows leave it out. */
  animatedStyle?: ComponentProps<typeof Animated.View>['style'];
}

interface Point {
  x: number;
  y: number;
}

/** Only a knight moves (±1, ±2) or (±2, ±1), so the squares alone identify its jump. */
export function isKnightJump(from: Square, to: Square): boolean {
  const df = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dr = Math.abs(Number(from[1]) - Number(to[1]));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

/**
 * One candidate move as an arrow: A solid, B dashed, each with a letter cap, so
 * the slots differ by color, shape and label. Straight for most pieces; for a
 * knight it is an L (two squares along the long leg, then one square across),
 * with both legs axis-aligned so they render crisply. Plain Views only.
 */
function MoveArrowImpl({ from, to, slot, orientation, cell, offset = 0, animatedStyle }: Props) {
  const a = squareOrigin(from, orientation, cell);
  const b = squareOrigin(to, orientation, cell);
  const start = { x: a.x + cell / 2, y: a.y + cell / 2 };
  const end = { x: b.x + cell / 2, y: b.y + cell / 2 };
  // Long leg first: along x when the jump spans two files, otherwise along y.
  const corner = Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  const points = isKnightJump(from, to) ? [start, corner, end] : [start, end];

  // Perpendicular shift for overlapping pairs, relative to the overall direction.
  const overall = Math.atan2(end.y - start.y, end.x - start.x);
  const ox = -Math.sin(overall) * offset * cell;
  const oy = Math.cos(overall) * offset * cell;
  const pts = points.map((p) => ({ x: p.x + ox, y: p.y + oy }));

  const color = slotColor(slot);
  const thick = Math.max(4, cell * 0.14);
  const headLen = cell * 0.36;
  const headW = cell * 0.42;
  // Clear the moving piece at the tail; leave room for the head before the target's center.
  const trimStart = cell * 0.22;
  const trimEnd = headLen + cell * 0.12;

  const legs: { p: Point; q: Point }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let p = pts[i]!;
    let q = pts[i + 1]!;
    if (i === 0) p = toward(p, q, trimStart);
    if (i === pts.length - 2) q = toward(q, p, trimEnd);
    // Run an inner leg past the corner by half its width so the joint is square.
    else q = toward(q, p, -thick / 2);
    legs.push({ p, q });
  }
  const last = legs[legs.length - 1]!;
  const headAngle = Math.atan2(last.q.y - last.p.y, last.q.x - last.p.x);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, animatedStyle]}>
      {legs.map(({ p, q }, i) => (
        <Leg key={i} p={p} q={q} thick={thick} color={color} dashed={slot === 'B'} dash={cell * 0.22} />
      ))}
      <View
        style={{
          position: 'absolute',
          // Centered half a head-length past the last leg's end, rotated about that center.
          left: last.q.x + (Math.cos(headAngle) * headLen) / 2 - headLen / 2,
          top: last.q.y + (Math.sin(headAngle) * headLen) / 2 - headW / 2,
          width: 0,
          height: 0,
          borderTopWidth: headW / 2,
          borderBottomWidth: headW / 2,
          borderLeftWidth: headLen,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color,
          transform: [{ rotate: `${headAngle}rad` }],
        }}
      />
      <View
        style={[
          styles.cap,
          {
            // On the to-square's corner; B sits on the opposite corner so a shared target shows both.
            left: b.x + ox + (slot === 'A' ? cell - cell * 0.36 : 0),
            top: b.y + oy,
            width: cell * 0.36,
            height: cell * 0.36,
            borderRadius: cell,
            backgroundColor: color,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.capText, { fontSize: cell * 0.22 }]}>
          {slot}
        </Text>
      </View>
    </Animated.View>
  );
}

/** `p` moved `d` pixels toward `q` (negative moves away). */
function toward(p: Point, q: Point, d: number): Point {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + ((q.x - p.x) / len) * d, y: p.y + ((q.y - p.y) / len) * d };
}

/** A straight bar from p to q: a box centered on the midpoint, rotated about its center. */
function Leg({ p, q, thick, color, dashed, dash }: { p: Point; q: Point; thick: number; color: string; dashed: boolean; dash: number }) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const box = {
    left: (p.x + q.x) / 2 - len / 2,
    top: (p.y + q.y) / 2 - thick / 2,
    width: len,
    height: thick,
    transform: [{ rotate: `${Math.atan2(q.y - p.y, q.x - p.x)}rad` }],
  };
  if (!dashed) return <View style={[styles.leg, box, { borderRadius: thick / 2, backgroundColor: color }]} />;
  const count = Math.max(1, Math.floor(len / (dash * 1.6)));
  return (
    <View style={[styles.leg, styles.dashed, box]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: Math.min(dash, len), height: thick, borderRadius: thick / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export const MoveArrow = memo(MoveArrowImpl);

type Ends = { from: Square; to: Square } | null | undefined;

/** Sideways offsets that keep A and B apart when they share a square. */
export function pairOffset(a: Ends, b: Ends): Record<MoveSlot, number> {
  const shared = a && b && (a.from === b.from || a.to === b.to);
  return shared ? { A: -0.12, B: 0.12 } : { A: 0, B: 0 };
}

const styles = StyleSheet.create({
  leg: { position: 'absolute' },
  dashed: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.55)' },
  capText: { fontWeight: '900', color: '#111' },
});
