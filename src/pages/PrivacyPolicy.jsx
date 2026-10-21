import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

export default function PrivacyPolicy() {
  return <LegalLayout title="Privacy Policy">
    <LegalSection title="Who operates this service">
      <p>Mc Sween’s Transport and Reside Co. operates the McSween Transport app for staff transport, vehicle tracking and boarding. Draft updated 20 October 2026.</p>
    </LegalSection>
    <LegalSection title="Information used by the app">
      <p>Depending on your role and the features you use, the service processes your name, email, telephone number, profile picture or chosen avatar, company membership, assigned bus, pickup location, workplace destination, trips and boarding records. Sign-in credentials are handled by the authentication service.</p>
      <p>The app also processes messages and attachments you send, incident and maintenance reports, device identifiers, app version, diagnostic events, notification tokens and operational audit records.</p>
    </LegalSection>
    <LegalSection title="Location and boarding">
      <p>Driver and kiosk location sharing supplies vehicle positions, route information and arrival estimates. When enabled, native driver tracking can continue with the app hidden or screen off and displays an Android tracking notification. Use the tracking controls or device permissions to stop it; unsent points may remain saved for later synchronization.</p>
      <p>Passengers may choose to use their current location to find a pickup spot or share a location. A saved pickup spot remains part of the transport record until changed or removed.</p>
      <p>NFC cards, boarding QR codes, typed codes and Bluetooth code delivery identify a passenger for boarding verification. Paired boarding tablets can hold a scoped passenger list and pending check-ins for offline use. Bluetooth delivery still requires verification and a Boarding or Exiting choice.</p>
    </LegalSection>
    <LegalSection title="Camera, recordings and remote support">
      <p>The camera is used when you scan a QR code, choose a photo, submit a report or deliberately start a supported camera feature. Voice messages use the microphone when you record them.</p>
      <p>Company kiosks support administrator live screen or camera viewing with a visible viewing indicator and Stop control. Android may also require system permission. Live support sessions have a ten-minute limit. The live viewing feature does not itself record video or audio.</p>
      <p>The separate rear dashcam records video on the tablet. Completed clips can be selected for transfer and playback by an authorized administrator while the tablet is online. This release does not automatically archive those clips in cloud storage. Local storage limits can remove older unprotected clips; protected clips and available storage affect recording capacity.</p>
    </LegalSection>
    <LegalSection title="Purpose and access">
      <p>The service uses this information to coordinate transport, verify boarding, communicate service changes, estimate arrival times, maintain vehicles, investigate incidents and diagnose errors.</p>
      <p>Access depends on role and approved company membership. Company managers have access to their company’s operational records; drivers receive information needed for their services. Platform administrators have broader access, and authorized maintenance staff can work across companies. A profile picture uploaded to public file storage has a shareable URL: do not use a sensitive document as your profile photo.</p>
    </LegalSection>
    <LegalSection title="Service providers and storage">
      <p>The current hosted service uses Base44. Supabase is being prepared as an alternative backend; the backend configured for your deployment handles its records. Mapping, hosting, authentication, email and notification providers process information required for the features in use. The relay server supports live connections between devices. Provider infrastructure may be outside Grenada.</p>
      <p>There is no single verified automatic deletion schedule for all operational records in the current app. Removing an account profile does not automatically erase associated trip, boarding, message, incident or audit records. The operator’s retention schedule and request-handling arrangements must be finalized before this draft is treated as the published policy.</p>
    </LegalSection>
    <LegalSection title="Your controls and requests">
      <p>You can edit your profile and pickup spot, select an avatar instead of a photo, manage notification preferences and revoke camera, microphone or location permissions. Some features require those permissions to work.</p>
      <p>My Account includes an account-deletion action. The current action removes the account profile; associated operational records may remain. Contact the transport office for requests to access, correct or remove those records. Signed-in users can contact the administrator through app Messages.</p>
      <p>This service is designed for company transport users. If a child’s information has been added unexpectedly, contact the transport office so it can be reviewed.</p>
    </LegalSection>
    <LegalSection title="Contact and updates">
      <p>The operator’s public privacy contact and business address are awaiting confirmation. This draft is not the final store-submission policy. Material changes to the final policy should be communicated to users.</p>
    </LegalSection>
  </LegalLayout>;
}
