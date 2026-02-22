// Type overrides for Tamagui v2 RC
// The `color` prop on Button works at runtime but the RC types don't include it.
// ButtonExtraProps is a `type` (not interface) so module augmentation doesn't work.
// Instead, we augment StackStyleBase which IS an interface.
import '@tamagui/web';

declare module '@tamagui/web' {
  interface StackStyleBase {
    color?: any;
    fontWeight?: any;
    placeholderTextColor?: any;
  }
}
