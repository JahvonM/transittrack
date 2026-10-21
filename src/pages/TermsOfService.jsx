import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

export default function TermsOfService() {
  return <LegalLayout title="Terms of Service">
    <LegalSection title="About the service">
      <p>Mc Sween’s Transport and Reside Co. provides the McSween Transport app to coordinate company transport, boarding, vehicle operations and communication. These are draft terms updated 20 October 2026; the operator must confirm the final terms and contact details before publication.</p>
    </LegalSection>
    <LegalSection title="Accounts and access">
      <p>Use only an account and boarding credentials assigned to you. Keep your password, codes and NFC card secure, and report a missing card or suspected misuse to the transport office. Access is determined by your authorized role and company membership.</p>
      <p>Do not use another person’s credentials, submit false records, interfere with the service or use messages to threaten or harass others.</p>
    </LegalSection>
    <LegalSection title="Boarding and transport">
      <p>A card tap, QR scan, typed code or Bluetooth delivery must be verified by the boarding system. Bluetooth delivery sends a code to the selected bus; it is not proof that boarding has completed. Confirm Boarding or Exiting on the tablet and check the result.</p>
      <p>Services may run from home pickup spots to the workplace or in the opposite direction. Check the selected direction, pickup point and service details. Report incorrect information to the transport office.</p>
      <p>Maps, arrival estimates and stop counts depend on available location and service data. They can be delayed or unavailable. Follow dispatch instructions and the agreed pickup time rather than relying solely on an estimate. Operational, traffic, weather or safety conditions may change a service.</p>
    </LegalSection>
    <LegalSection title="Safety and device features">
      <p>Drivers must not operate app controls while driving. Stop safely before interacting with navigation, messages, recording playback or device settings. Follow the driver’s safety instructions and use seat belts where fitted.</p>
      <p>The in-app SOS and reporting tools do not replace emergency services. Contact local emergency services directly when urgent assistance is needed.</p>
      <p>Driver GPS sharing, company-kiosk administration, remote viewing and rear-dashcam recording are described in the Privacy Policy. Visible tracking, viewing and recording controls must remain available. Companies are responsible for informing affected staff about monitoring and for authorized use of their tablets.</p>
    </LegalSection>
    <LegalSection title="Availability and saved work">
      <p>The app depends on devices, internet access and external providers. Some work can be saved offline and synchronized later; a saved or pending status is not the same as server confirmation. Do not clear tablet storage, uninstall the kiosk or change its assignment while unresolved saved work remains.</p>
      <p>Local recordings depend on the tablet’s storage and are not automatically backed up to the cloud. Preserve any required clip through the supported controls before older unprotected clips are removed.</p>
    </LegalSection>
    <LegalSection title="Charges and responsibilities">
      <p>Any transport or service charges follow the separate agreement or quotation accepted with the operator. This app page does not introduce a new payment schedule or change that agreement.</p>
      <p>Companies are responsible for the accuracy of the operational information they provide and for the drivers, vehicles, permissions, insurance and safety arrangements under their control. Nothing in these draft terms removes rights or responsibilities that apply under applicable law.</p>
    </LegalSection>
    <LegalSection title="Closing an account and contacting us">
      <p>You can request account-profile deletion in My Account. Other operational records may remain as described in the Privacy Policy. Contact the transport office for broader data requests or access problems. Signed-in users can message an administrator in the app.</p>
      <p>The operator’s public contact details and final business terms are awaiting confirmation. These draft pages do not yet constitute the final store-submission documents.</p>
    </LegalSection>
  </LegalLayout>;
}
