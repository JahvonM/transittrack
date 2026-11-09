import React, { useEffect, useState } from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { NO_BUSINESS, loadBusinessDetails, loadSupportNumber } from "@/lib/appSupport";

// The Privacy Policy (/privacy and the website's /privacy). Contact details
// come from Admin -> Settings -> Business details; anything not set there is
// simply left out.
export const PRIVACY_UPDATED = "9 November 2026";

function Contact({ details, whatsapp }) {
  const tel = (v) => v.replace(/[^\d+]/g, "");
  const items = [
    details.contact_email && <li key="email">Email: <a className="font-semibold text-primary hover:underline" href={`mailto:${details.contact_email}`}>{details.contact_email}</a></li>,
    details.contact_phone && <li key="phone">Phone: <a className="font-semibold text-primary hover:underline" href={`tel:${tel(details.contact_phone)}`}>{details.contact_phone}</a></li>,
    whatsapp && <li key="wa">WhatsApp: <a className="font-semibold text-primary hover:underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">+{whatsapp}</a></li>,
    details.business_address && <li key="address">Address: {details.business_address}</li>,
  ].filter(Boolean);
  if (!items.length) return <p>Reply to any email we have sent you about your ride, or message the transport office from the app.</p>;
  return <ul className="list-disc space-y-1 pl-5">{items}</ul>;
}

export default function PrivacyPolicy() {
  const [details, setDetails] = useState(NO_BUSINESS);
  const [whatsapp, setWhatsapp] = useState("");
  useEffect(() => {
    let live = true;
    loadBusinessDetails().then((d) => { if (live) setDetails(d); });
    loadSupportNumber().then((n) => { if (live) setWhatsapp(n); });
    return () => { live = false; };
  }, []);

  return <LegalLayout title="Privacy Policy" draft={false}>
    <p className="text-body-sm text-muted-foreground">Last updated {PRIVACY_UPDATED}.</p>

    <LegalSection title="Who operates this service">
      <p>Mc Sween’s Transport and Reside Co. operates the McSween Transport app for staff transport, vehicle tracking and boarding.</p>
    </LegalSection>

    <LegalSection title="Information used by the app">
      <p>Depending on your role and the features you use, the service processes your name, email, telephone number, profile picture or chosen avatar, company membership, assigned bus, pickup location, workplace destination, trips and boarding records. Sign-in credentials are handled by the authentication service.</p>
      <p>The app also processes messages and attachments you send, incident and maintenance reports, device identifiers, app version, diagnostic events, notification tokens and operational audit records.</p>
    </LegalSection>

    <LegalSection title="Location and boarding">
      <p>Driver and kiosk location sharing supplies vehicle positions, route information and arrival estimates. When enabled, native driver tracking can continue with the app hidden or screen off and displays an Android tracking notification. Use the tracking controls or device permissions to stop it; unsent points may remain saved for later synchronization.</p>
      <p>The McSween Driver app on a driver’s own phone links the phone to that driver with a code from the transport office. It shares the phone’s location only while the driver shares the bus they chose for a shift, including with the screen off (Android shows a notification, iPhone shows its location indicator). It stops when the driver stops sharing, ends the shift, changes bus or unpairs the phone, and it never asks for location access “all the time”. The app has no account to create: removing the phone in Admin or unpairing it in the app ends the link.</p>
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
    </LegalSection>

    <LegalSection title="How long we keep information">
      <p>Trip, boarding, message, incident, maintenance and audit records are kept for as long as needed to run the transport service, investigate incidents and meet our record-keeping obligations.</p>
      <p>Removing your account profile does not automatically erase those records. You can ask us to review or remove records about you using the contact details below.</p>
    </LegalSection>

    <LegalSection title="Your controls and requests">
      <p>You can edit your profile and pickup spot, select an avatar instead of a photo, manage notification preferences and revoke camera, microphone or location permissions. Some features require those permissions to work.</p>
      <p>My Account includes an account-deletion action, which removes the account profile. To access, correct or remove other records, contact us.</p>
      <p>This service is designed for company transport users. If a child’s information has been added unexpectedly, contact the transport office so it can be reviewed.</p>
    </LegalSection>

    <LegalSection title="Contact and changes">
      <Contact details={details} whatsapp={whatsapp} />
      <p>We’ll tell users about material changes to this policy through the app or by email.</p>
    </LegalSection>
  </LegalLayout>;
}