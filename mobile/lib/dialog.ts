import { Alert, Platform } from "react-native";

// React Native Web implements Alert.alert as a no-op, so on web every alert and
// confirmation silently did nothing (e.g. Logout never ran). These helpers use the
// browser's dialogs on web and native alerts everywhere else.

/** Shows a message with a single OK button. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Asks the user to confirm an action; resolves to true if they did. */
export function confirm({
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  destructive = false,
}: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      globalThis.confirm?.(message ? `${title}\n\n${message}` : title) ?? false
    );
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      // Android: tapping outside the dialog dismisses it.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
