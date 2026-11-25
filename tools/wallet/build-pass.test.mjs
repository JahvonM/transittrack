import test from 'node:test';
import assert from 'node:assert/strict';
import {makePassJson} from './build-pass.mjs';
const base={passTypeIdentifier:'pass.com.mcsweenstransport.passenger',teamIdentifier:'ABCDE12345',passengerName:'Test Passenger',passengerId:'TEST-001',companyName:'Demo Bus',barcodeToken:'test-credential-placeholder-001-123456789'};
test('creates a generic Wallet QR pass without NFC entitlement',()=>{
 const result=makePassJson(base);
 assert.equal(result.formatVersion,1);
 assert.equal(result.generic.primaryFields[0].value,'Test Passenger');
 assert.equal(result.barcodes[0].message,base.barcodeToken);
 assert.equal(result.nfc,undefined);
 assert.ok(result.serialNumber);
});
test('rejects use of passenger ID as QR credential',()=>assert.throws(()=>makePassJson({...base,barcodeToken:'TEST-001'})));
test('rejects malformed Apple Team ID',()=>assert.throws(()=>makePassJson({...base,teamIdentifier:'123'})));
