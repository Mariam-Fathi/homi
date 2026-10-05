/**
 * @jest-environment node
 */
import { Alert, Platform } from "react-native";
import { confirm, notify } from "@/lib/dialog";

const setPlatform = (os: typeof Platform.OS) =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });

describe("dialog helpers", () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  describe("on web (where Alert.alert is a no-op)", () => {
    beforeEach(() => setPlatform("web"));

    it("confirm uses the browser dialog and returns its answer", async () => {
      // Regression: Logout used Alert.alert, which silently did nothing on web.
      (globalThis as any).confirm = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

      await expect(confirm({ title: "Logout", message: "Sure?" })).resolves.toBe(true);
      await expect(confirm({ title: "Logout" })).resolves.toBe(false);
      expect((globalThis as any).confirm).toHaveBeenCalledWith("Logout\n\nSure?");
    });

    it("notify uses the browser alert", () => {
      (globalThis as any).alert = jest.fn();
      notify("Sign-in failed", "Try again");
      expect((globalThis as any).alert).toHaveBeenCalledWith("Sign-in failed\n\nTry again");
    });
  });

  describe("on native", () => {
    beforeEach(() => setPlatform("ios"));

    it("confirm resolves from the pressed Alert button", async () => {
      const alert = jest.spyOn(Alert, "alert");

      const pending = confirm({ title: "Logout", confirmText: "Logout", destructive: true });
      const buttons = alert.mock.calls[0][2]!;
      expect(buttons.map((b) => [b.text, b.style])).toEqual([
        ["Cancel", "cancel"],
        ["Logout", "destructive"],
      ]);
      buttons[1].onPress!();
      await expect(pending).resolves.toBe(true);

      const cancelled = confirm({ title: "Logout" });
      alert.mock.calls[1][2]![0].onPress!();
      await expect(cancelled).resolves.toBe(false);
    });
  });
});
