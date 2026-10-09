// Web build of ./haptics: desktops have nothing to vibrate and phones' browsers
// buzz on their own terms, so every call is a no-op here.
const noop = () => {};

export const haptics = {
  selection: noop,
  light: noop,
  medium: noop,
  heavy: noop,
  rigid: noop,
  success: noop,
  warning: noop,
  error: noop,
};
