# Telpo T10 kiosk integration

## Findings from the supplied diagnostic captures

- Model T10, Android 12 (API 31), firmware display ID `20241216.104938`.
- Android NFC is enabled. The card capture reports MIFARE detection followed by `Tag dispatch failed`. This proves detection, not a successful passenger lookup.
- Camera provider and camera service are running but enumerate zero cameras. Snapdragon Camera crashes in `SettingsManager.getSupportedAntiBandingLevelAvailableModes` with `Index: 0, Size: 0`.
- These captures do not prove a missing or disconnected camera, nor that the barcode scanner is broken.

Telpo's T10 support answer explicitly distinguishes its hardware barcode scanner from a normal Android camera. Test the Telpo SDK demo via **QR code → hard reader → open**:
https://www.telpo.vip/index.php?qa=708&qa_1=got-the-devices-the-nfc-part-working-fine-but-camera-working

Telpo's product specification lists the facial camera as optional:
https://sec.telpo.cn/ticket-validator/T10

## NFC change

The kiosk-only manifest enables optional integrated NFC. The existing `UsbNfc` Capacitor bridge uses Android reader mode when integrated NFC is present and no ACS USB reader is attached. ACS installations keep their existing path. An integrated reader that is switched off reports that explicitly.

UID bytes are passed in their original order as uppercase hexadecimal, including leading zeros. Existing passenger lookup, authorization, tap IDs, acknowledgement, and delivery retry remain in use. The reader never writes cards or treats detection as acceptance. Card values remain in memory and are not logged.

Integrated polling stays alive across boarding result screens so a held card is not automatically a fresh tap when the screen becomes ready again. Taps outside the active boarding screen are ignored. Backgrounding or disabling reading releases reader mode and cancels the pending receipt. Android NFC state changes and the retry button restart detection.

## Physical-device acceptance checks

1. Build the kiosk variant and update with the same signing identity as the installed kiosk. Do not uninstall an enrolled kiosk to work around a signature mismatch.
2. Enable Android NFC and open boarding. Settings should identify the built-in reader without requiring USB accessibility permissions.
3. Tap an existing registered passenger card. Confirm the same passenger and exactly one boarding event; verify an unregistered or revoked card is rejected.
4. Hold a card through the result screen, remove it, then tap again. Confirm no duplicate from holding, and that a fresh tap works.
5. Test background/resume, disabled reading, Android NFC off/on, and lost connectivity against the app's existing boarding rules.
6. Verify an ACR122U installation still reads and acknowledges cards. The store variant must compile without gaining the kiosk NFC permission.

## Remaining scanner work

Obtain the Android 12 T10 SDK with its hardware barcode reader demo, library files, callback/result contract, and any required service or firmware versions from Telpo/the supplier. Confirm the demo can scan a printed QR code and a phone-screen QR code before adapting its decoded string into the kiosk's existing QR validation path. Do not infer an intent action or scanner power command from the package name alone.

Actual camera preview/recording is a separate requirement. Ask the supplier whether this specific unit includes the optional camera and, if so, why the installed firmware enumerates none.
