import * as Haptics from 'expo-haptics';

// Every haptic goes through here. Fire-and-forget: nothing on an interaction
// path awaits these, and the OS setting decides whether they are felt.
export const haptics = {
  selection: () => void Haptics.selectionAsync(),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  rigid: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
