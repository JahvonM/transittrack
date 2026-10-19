"""One-off: rename visible TransitTrack text to McSween Transport in the native apps
and the remaining web lines. Kept on purpose: package ids, file names, log tags,
user agents, wake-lock tags, update asset names, cache/message prefixes."""
from pathlib import Path

R = Path('/app')
EDITS = {
    # ---------- Android tablet app ----------
    'android/app/src/main/res/values/strings.xml': [
        ('TransitTrack Kiosk', 'McSween Kiosk', 2),
        ('TransitTrack USB auto-accept', 'McSween USB auto-accept', 1),
        ('confirms TransitTrack GPS', 'confirms McSween Transport GPS', 1),
        ('while a TransitTrack USB', 'while a McSween Transport USB', 1),
    ],
    'android/app/src/main/java/com/transittrack/app/SupportProjectionService.kt': [
        ('"TransitTrack screen sharing"', '"McSween Transport screen sharing"', 1),
    ],
    'android/app/src/main/java/com/transittrack/app/BoardingBleProtocol.java': [
        ('"TransitTrack bus"', '"McSween bus"', 1),
    ],
    'android/app/src/test/java/com/transittrack/app/BoardingBleProtocolTest.java': [
        ('"TransitTrack bus"', '"McSween bus"', 1),
    ],
    # ---------- Kiosk helper ----------
    'kiosk-helper/AndroidManifest.xml': [
        ('android:label="TransitTrack Helper"', 'android:label="McSween Helper"', 1),
        ('android:label="TransitTrack Helper (auto OK)"', 'android:label="McSween Helper (auto OK)"', 1),
    ],
    'kiosk-helper/res/values/strings.xml': [
        ('popups that mention TransitTrack Helper.', 'popups that mention McSween Helper (or its old name, TransitTrack Helper).', 1),
    ],
    'kiosk-helper/src/com/transittrack/kioskhelper/HelperService.java': [
        ('NotificationChannel(CHANNEL, "TransitTrack Helper"', 'NotificationChannel(CHANNEL, "McSween Helper"', 1),
        ('setContentTitle("TransitTrack Helper")', 'setContentTitle("McSween Helper")', 1),
        ('from any TransitTrack page', 'from any McSween Transport page', 1),
    ],
    'kiosk-helper/src/com/transittrack/kioskhelper/BleBoarding.java': [
        ('"TransitTrack bus"', '"McSween bus"', 1),
        ('advertises a TransitTrack service', 'advertises a McSween Transport service', 1),
        ('with the TransitTrack app open', 'with the McSween Transport app open', 1),
    ],
    'kiosk-helper/src/com/transittrack/kioskhelper/AutoOkService.java': [
        (' * so it asks "Allow TransitTrack Helper to access ACR122U?" again. This taps OK on that popup.\n'
         ' * It only acts on System UI popups that mention TransitTrack Helper.\n',
         ' * so it asks "Allow McSween Helper to access ACR122U?" again. This taps OK on that popup.\n'
         ' * It only acts on System UI popups that mention this app by name: McSween Helper, or\n'
         ' * TransitTrack Helper, its name before the rename (Android may still show the old name\n'
         ' * until the new version is installed).\n', 1),
        ('    private long lastClick = 0;\n',
         '    private static final String[] NAMES = {"McSween Helper", "TransitTrack Helper"};\n'
         '    private long lastClick = 0;\n', 1),
        ('        List<AccessibilityNodeInfo> mention = root.findAccessibilityNodeInfosByText("TransitTrack Helper");\n'
         '        if (mention == null || mention.isEmpty()) return false;\n',
         '        if (!mentionsUs(root)) return false;\n', 1),
        ('    @Override public void onInterrupt() { }\n',
         '    private static boolean mentionsUs(AccessibilityNodeInfo root) {\n'
         '        for (String name : NAMES) {\n'
         '            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(name);\n'
         '            if (found != null && !found.isEmpty()) return true;\n'
         '        }\n'
         '        return false;\n'
         '    }\n\n'
         '    @Override public void onInterrupt() { }\n', 1),
    ],
    # ---------- iPhone app ----------
    'ios/App/App/Info.plist': [
        ('<string>TransitTrack</string>', '<string>McSween</string>', 1),
        ('<string>TransitTrack needs', '<string>McSween Transport needs', 1),
        ('<string>TransitTrack uses', '<string>McSween Transport uses', 3),
    ],
    'capacitor.config.json': [
        ('"appName": "TransitTrack"', '"appName": "McSween Transport"', 1),
    ],
    'driver-android/twa-manifest.json': [
        ('"name": "TransitTrack Driver"', '"name": "McSween Driver"', 1),
    ],
    'public/tools/gkd-usb-ok.json5': [
        ('GKD rule for TransitTrack kiosk tablets', 'GKD rule for McSween Transport kiosk tablets', 1),
        ("name: 'TransitTrack kiosk'", "name: 'McSween kiosk'", 1),
        ('version: 2,', 'version: 3,', 1),
        ("author: 'TransitTrack'", "author: 'McSween Transport'", 1),
    ],
    # ---------- Windows desktop app ----------
    'desktop/package.json': [
        ('"description": "TransitTrack Admin and Mechanic for Windows"', '"description": "McSween Transport Admin and Mechanic for Windows"', 1),
        ('"author": "TransitTrack"', '"author": "McSween Transport"', 1),
        ('"productName": "TransitTrack Desktop"', '"productName": "McSween Transport Desktop"', 1),
        ('"shortcutName": "TransitTrack Desktop"', '"shortcutName": "McSween Transport Desktop"', 1),
    ],
    'desktop/main.cjs': [
        ("app.enableSandbox();\n",
         "app.enableSandbox();\n"
         "// Keep saved sign-ins and settings where the app kept them before it was\n"
         "// renamed from TransitTrack Desktop (Windows derives this folder from the name).\n"
         "app.setPath('userData',path.join(app.getPath('appData'),'TransitTrack Desktop'));\n", 1),
        ("'TransitTrack opened in your web browser.", "'McSween Transport opened in your web browser.", 1),
        ("'This link opens outside TransitTrack Desktop.'", "'This link opens outside McSween Transport Desktop.'", 1),
        ("title:'TransitTrack Desktop'", "title:'McSween Transport Desktop'", 1),
        ("mainWindow.setTitle('TransitTrack Desktop')", "mainWindow.setTitle('McSween Transport Desktop')", 1),
        ("title:'TransitTrack permission'", "title:'McSween Transport permission'", 1),
        ("'Allow TransitTrack to connect", "'Allow McSween Transport to connect", 1),
        ("'That page opens outside TransitTrack Desktop.'", "'That page opens outside McSween Transport Desktop.'", 1),
        ("label:'About TransitTrack Desktop'", "label:'About McSween Transport Desktop'", 1),
        ("message:'TransitTrack Deskto", "message:'McSween Transport Deskto", 1),
    ],
    'desktop/main.test.cjs': [
        ("requestSingleInstanceLock:()=>true,", "requestSingleInstanceLock:()=>true,setPath(name,dir){this.paths={...this.paths,[name]:dir};},getPath:name=>'/appdata',", 1),
    ],
    'desktop/setup-main.cjs': [
        ("name:'TransitTrack tablet setup'", "name:'McSween tablet setup'", 1),
        ("'Update TransitTrack Helper on '", "'Update McSween Helper on '", 1),
        ("title:'TransitTrack • Tablet & NFC setup'", "title:'McSween Transport • Tablet & NFC setup'", 1),
    ],
    'desktop/browser-signin.cjs': [
        ('<title>TransitTrack Desktop</title>', '<title>McSween Transport Desktop</title>', 1),
        ("'Start signing in from TransitTrack Desktop.'", "'Start signing in from McSween Transport Desktop.'", 4),
        ("'Only the TransitTrack website can finish a desktop sign-in.'", "'Only the McSween Transport website can finish a desktop sign-in.'", 1),
        ("'Go back to TransitTrack Desktop and", "'Go back to McSween Transport Desktop and", 2),
        ("'TransitTrack Desktop is opening your workspace now.", "'McSween Transport Desktop is opening your workspace now.", 1),
    ],
    'desktop/updates.cjs': [
        ("title:'TransitTrack update available'", "title:'McSween Transport update available'", 1),
        ("message:'TransitTrack Desktop '", "message:'McSween Transport Desktop '", 1),
    ],
    'desktop/reader-process.cjs': [
        ("Reinstall TransitTrack Desktop.", "Reinstall McSween Transport Desktop.", 1),
    ],
    'desktop/offline.html': [
        ('<title>TransitTrack Desktop</title>', '<title>McSween Transport Desktop</title>', 1),
        ('TransitTrack Desktop', 'McSween Transport Desktop', None),
        ('TransitTrack couldn', 'McSween Transport couldn', 1),
    ],
    # ---------- Web lines that name the native apps ----------
    'src/components/driver/TabletRecoveryPanel.jsx': [
        ('"TransitTrack is the tablet\'s Home app."', '"McSween Kiosk is the tablet\'s Home app."', 1),
        ('"Android Home app has not been set to TransitTrack."', '"Android Home app has not been set to McSween Kiosk."', 1),
        ('choose TransitTrack Kiosk as the Home app', 'choose McSween Kiosk (called TransitTrack Kiosk before the rename) as the Home app', 1),
    ],
    'src/components/driver/UsbGpsPanel.jsx': [
        ('"Open tablet Settings → Accessibility → TransitTrack USB auto-accept."', '"Open tablet Settings → Accessibility → McSween USB auto-accept (TransitTrack USB auto-accept on older versions)."', 1),
    ],
    'src/components/driver/UsbNfcPanel.jsx': [
        ('"Open tablet Settings → Accessibility → TransitTrack USB auto-accept."', '"Open tablet Settings → Accessibility → McSween USB auto-accept (TransitTrack USB auto-accept on older versions)."', 1),
    ],
    'src/components/driver/TabletNetworkPanel.jsx': [
        ('The TransitTrack Helper on this tablet isn\'t reporting yet.', 'The McSween Helper on this tablet isn\'t reporting yet.', 1),
        ('update the TransitTrack Helper on this tablet', 'update the McSween Helper on this tablet', 1),
    ],
    'src/components/admin/CardIssuingTab.jsx': [
        ('<b>TransitTrack Card Reader</b>', '<b>McSween Card Reader</b>', 1),
        ('“TransitTrack Card Reader”', '“McSween Card Reader”', 1),
    ],
    'src/components/admin/KioskTablets.jsx': [
        ('with the TransitTrack Helper built in.</li>', 'with the McSween Helper built in.</li>', 1),
        ('The TransitTrack Helper is built into both setup downloads.', 'The McSween Helper is built into both setup downloads.', 1),
    ],
    'src/components/admin/FleetHealthTab.jsx': [
        ('come from the TransitTrack Helper app on each tablet; uploads waiting and app version come from TransitTrack itself.',
         'come from the McSween Helper app on each tablet; uploads waiting and app version come from McSween Transport itself.', 1),
    ],
    'src/lib/bluetoothBoarding.js': [
        ('"TransitTrack isn\'t allowed to use Bluetooth. Turn it on in your phone\'s Settings under TransitTrack, or show your QR instead."',
         '"McSween Transport isn\'t allowed to use Bluetooth. Turn it on in your phone\'s Settings under McSween, or show your QR instead."', 1),
    ],
    'src/lib/tabletSetupBundle.js': [
        ('rem ===== TransitTrack Helper ${batSafe(version)}', 'rem ===== McSween Helper ${batSafe(version)}', 1),
    ],
}

problems = []
for rel, edits in EDITS.items():
    p = R / rel
    text = p.read_text(encoding='utf-8')
    for old, new, want in edits:
        n = text.count(old)
        if (want is None and n == 0) or (want is not None and n != want):
            problems.append(f'{rel}: expected {want} of {old[:60]!r}, found {n}')
            continue
        text = text.replace(old, new)
    p.write_text(text, encoding='utf-8')
print('\n'.join(problems) or 'all edits applied')
