# TransitTrack Apple Wallet passenger cards — setup and rollout

Status: **Local pass-building starter only**. No live endpoint, deployed feature, production data changes, or NFC support.

## Apple Developer steps
1. Register Pass Type ID `pass.com.mcsweenstransport.passenger` under Certificates, Identifiers & Profiles > Identifiers > + > Pass Type IDs. Use the identical ID in the pass and signing certificate.
2. Create a **Pass Type ID Certificate** with a certificate signing request (CSR); securely retain the private key that generated the CSR.
3. Record your **10-character Apple Team ID**.
4. Download certificate (.cer). Convert on your workstation with `openssl x509 -inform DER -in pass.cer -out pass.pem`.
5. Download the current **Apple WWDR intermediate** certificate from Apple's certificate authority page, convert to PEM, and check certificate chain and expiry.
6. Prepare branding PNG files: icon.png (29x29) and icon@2x.png (58x58). Keep production art and secrets out of the repository.
7. Issue a **test passenger QR credential using your existing secure passenger account service**. Never use a passenger ID, email, or NFC chip UID as a bearer QR token.
8. Build one signed test .pkpass. Open on a real iPhone. Check Wallet display, QR scanning at kiosk, company and assigned bus authorization, boarding and exiting, revocation and duplicate tap handling.
9. Only then implement a properly authenticated server issuance endpoint in Supabase with company scoping and RLS. The server should look up authorized passenger identity and existing QR credential; no user-controlled `passengerId` or `barcodeToken` should be accepted by public APIs.
10. Implement optional Wallet update registration, device tracking, revocation and reissue, then release behind a feature flag.

## Developer build (local only)
```powershell
node --test tools/wallet/build-pass.test.mjs
node tools/wallet/build-pass.mjs test-card.json test-pass.pkpass pass.pem pass-private.key AppleWWDR.pem icon.png icon@2x.png
```

Example `test-card.json` structure (DO NOT COMMIT real credentials):
```json
{"passTypeIdentifier":"pass.com.mcsweenstransport.passenger","teamIdentifier":"YOURTEAMID","passengerName":"Test Passenger","passengerId":"TEST-001","companyName":"Demo Company","barcodeToken":"REPLACE-WITH-LONG-SERVER-ISSUED-TEST-CREDENTIAL"}
```

To deliver through web, return the signed .pkpass as `application/vnd.apple.pkpass` from an authenticated server endpoint. Never place signing materials in client-side JavaScript or public GitHub.

## Important NFC distinction
Ordinary Apple Wallet QR passes do **not** grant Apple VAS NFC support. To offer NFC tap-to-board from Apple Wallet, confirm the Telpo T10 and each kiosk's reader is **Apple VAS compatible/certified**, and obtain Apple's NFC pass entitlement/certificate or approved integration provider. Do NOT add the `nfc` field before approval. Android HCE is a separate project and does not make iPhones emulate the same custom cards.

Official Apple sources:
- https://developer.apple.com/documentation/walletpasses/building-a-pass
- https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/
- https://developer.apple.com/wallet/loyalty-passes/
- https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
