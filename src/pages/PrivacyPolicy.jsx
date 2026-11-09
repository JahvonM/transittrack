import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import LegalContact, { useBusinessContact } from "@/components/legal/LegalContact";

// The Privacy Policy (app /privacy and the website's /privacy; the app stores
// link here). The contact details come from Admin -> Settings -> Business
// details. Keep it in step with the app: a new kind of information, a new
// provider or a change to how long something is kept belongs here, with a
// new date. What it says is kept, and where:
//   bus location history: 90 days (tt-gps-cleanup, supabase/migrations/20261020111953_*)
//   ride tracking links: base44/shared/visitorLinks.ts linkExpiry
//   shared journey links: base44/shared/journeyShare.ts SHARE_HOURS
//   live views: 10 minutes, not recorded (tabletSupport, officeDisplay)
//   dashcam clips: on the tablet only (tabletRecordings)
//   error reports: src/lib/breadcrumbs.js (never what anyone typed)
export const PRIVACY_UPDATED = "9 November 2026";

const List = ({ children }) => <ul className="list-disc space-y-2 pl-5">{children}</ul>;
const Item = ({ label, children }) => <li><strong className="font-semibold text-foreground">{label}</strong> {children}</li>;

export default function PrivacyPolicy() {
  const { details, whatsapp } = useBusinessContact();

  return <LegalLayout title="Privacy Policy">
    <p className="text-body-sm text-muted-foreground">Last updated {PRIVACY_UPDATED}.</p>

    <LegalSection title="Who we are">
      <p>Mc Sween’s Transport and Reside Co. (“McSween Transport”, “we”) runs airport pickups and drop-offs, transfers, island tours and staff transport in Grenada.</p>
      <p>This policy explains what information our website and apps use, why, who can see it, how long we keep it and what you can do about it. It covers people who request a ride, passengers, drivers, company staff and managers, and our own team.</p>
    </LegalSection>

    <LegalSection title="What we collect">
      <List>
        <Item label="Your account:">your name, email, phone number, profile photo or the avatar you choose, your role, your company and your assigned bus. Your password is handled by the sign-in service, and we never see it. If you sign in with Google or Apple, they confirm who you are and give us your name and email.</Item>
        <Item label="Ride requests from our website:">your name, phone, email, the pickup and drop-off places and time, your flight number, the number of passengers and bags, and any notes. While you fill in the form, your browser keeps what you have typed in that tab until you send it or close the tab.</Item>
        <Item label="Rides and boarding:">your pickup spot and workplace, your rides and their times, prices for billing, and each time you get on or off a bus, whether by card tap, QR code, typed code or Bluetooth, with the bus and the time.</Item>
        <Item label="Location:">where buses are while they are in service, and where you are only when you choose to share it. See “Location” below.</Item>
        <Item label="Messages and reports:">the messages, photos and voice notes you send, and incident, fault, lost-item and inspection reports.</Item>
        <Item label="Devices:">the app version and device type, a notification token so we can send you alerts and, for bus tablets, their battery, network and health. If the app goes wrong, it sends us an error report with the screen it was on and the last few steps before it. Error reports never include passwords or anything you typed.</Item>
        <Item label="Changes by staff:">edits made in Admin are logged with who made them and when.</Item>
      </List>
    </LegalSection>

    <LegalSection title="Location">
      <p>Bus tablets and drivers’ apps share a bus’s position while it is in service. That lets our office, passengers and people with a tracking link see where the bus is and when it will arrive. A driver’s app can keep sharing with the screen off. Android shows a notification while it does.</p>
      <p>The McSween Driver app on a driver’s own phone shares that phone’s location only while the driver is sharing the bus they chose for a shift. It stops when the driver stops sharing, ends the shift, changes bus or unpairs the phone. It never asks for location access “all the time”.</p>
      <p>From bus positions we work out speed, arrival and travel times, and driving events such as speeding. These appear in the vehicle log and driver reports for our office.</p>
      <p>A passenger’s location is used only when you choose: to find your pickup spot, or to share your journey with someone. A shared journey link shows your bus for 3 hours.</p>
      <p>Some screens show the local weather. If you allow location, your device’s position is sent to Open-Meteo, a weather service, to get it. Open-Meteo is not told who you are.</p>
    </LegalSection>

    <LegalSection title="Camera, microphone and dashcam">
      <p>The app uses your camera only when you scan a QR code, take or choose a photo, or start a camera feature yourself. It uses your microphone only while you record a voice message.</p>
      <p>Bus tablets have a rear dashcam that records video on the tablet. Clips stay on the tablet and are not uploaded automatically. When its storage is full, older clips are recorded over, except clips an administrator has protected. An administrator can play a clip from the tablet and save a copy.</p>
      <p>Administrators can watch a bus tablet’s screen or camera live, for support and safety, and can show that view on a screen in our office. The tablet shows that it is being viewed and has a Stop button. A live view ends after 10 minutes, and live views are not recorded.</p>
    </LegalSection>

    <LegalSection title="How we use it">
      <p>We use this information to plan and run rides, confirm and track bookings, check who boards each bus, bill customers and companies, keep buses maintained and safe, look into incidents and complaints, send you updates about your ride, and fix problems with the app.</p>
      <p>We don’t sell your information, and we don’t use it to target advertising.</p>
    </LegalSection>

    <LegalSection title="Who can see it">
      <List>
        <Item label="Our team,">according to their role: dispatch and administrators see what they need to run the service, and maintenance staff see vehicle records.</Item>
        <Item label="Your company,">for staff transport: its managers see their own company’s staff, pickup spots, cards and boarding records, never another company’s.</Item>
        <Item label="Drivers">see what they need for their run, such as the names and pickup spots of the passengers on it.</Item>
        <Item label="Other passengers">never see your pickup spot or your rides.</Item>
        <Item label="Anyone with a tracking or shared-journey link">sees that one bus and ride, and nothing else: no passenger lists or phone numbers.</Item>
        <Item label="Profile photos">are stored at a web address that anyone who has it can open, so don’t use a photo of a document.</Item>
      </List>
      <p>We may also share information when the law requires it, or to protect someone’s safety.</p>
    </LegalSection>

    <LegalSection title="Companies that help us run the service">
      <p>These providers handle information only to provide their part of the service:</p>
      <List>
        <Item label="Supabase:">the app’s database, sign-in, file storage and servers, in the United States.</Item>
        <Item label="Base44:">the platform the app is built on.</Item>
        <Item label="Cloudflare:">hosts our website and app pages.</Item>
        <Item label="Mapbox:">maps, address search and routes.</Item>
        <Item label="Google Firebase:">delivers notifications to phones and tablets.</Item>
        <Item label="Resend:">sends our emails.</Item>
        <Item label="Open-Meteo:">the local weather, as described above.</Item>
      </List>
      <p>Live video travels directly between devices, or through a relay server when a network needs one. If you message us on WhatsApp, or sign in with Google or Apple, that company handles it under its own privacy policy.</p>
      <p>Some of these providers are outside Grenada, so your information can be stored and processed in other countries, including the United States.</p>
    </LegalSection>

    <LegalSection title="How long we keep it">
      <List>
        <Item label="Bus location history:">90 days, then deleted automatically.</Item>
        <Item label="Ride tracking links:">stop working a day after the planned pickup time, and at most 7 days after we send them. Shared journey links stop after 3 hours.</Item>
        <Item label="Dashcam clips:">on the tablet until they are recorded over, unless an administrator protects or saves them.</Item>
        <Item label="Live views:">not kept.</Item>
        <Item label="Everything else">(your account, rides, boarding, messages, reports and billing records): while you or your company use our service, and after that for as long as we need it for billing, safety, a dispute or the law.</Item>
      </List>
    </LegalSection>

    <LegalSection title="Your choices and rights">
      <List>
        <Item label="Change your details:">your name, photo or avatar, pickup spot and notifications, in the app.</Item>
        <Item label="Turn permissions off:">location, camera, microphone or notifications, in your phone’s settings. Some features don’t work without them.</Item>
        <Item label="Delete your account:">on your Account page in the app, choose Delete account. This removes your account profile straight away. Records of rides, boarding, messages and reports are kept as described above.</Item>
        <Item label="Ask us:">for a copy of your information, to correct it, or to delete it, with or without the app, using the contact details below. We’ll reply within 30 days. We’ll delete your information or remove your name from it, unless we need to keep it for billing, safety, a dispute or the law.</Item>
      </List>
    </LegalSection>

    <LegalSection title="Keeping it safe">
      <p>Access is limited by role and by company. Connections to the app are encrypted, bus tablets use their own device keys, and tracking links expire. No system is completely secure, so keep your password, card and codes to yourself, and tell us straight away if you think someone else is using them.</p>
    </LegalSection>

    <LegalSection title="Children">
      <p>The app is made for company staff, customers who book rides, and our team. It isn’t meant for children to use on their own. If you think a child’s information has been added, contact us and we’ll review it.</p>
    </LegalSection>

    <LegalSection title="Changes to this policy">
      <p>When we change this policy, we update the date at the top. For important changes, we’ll also tell you in the app or by email.</p>
    </LegalSection>

    <LegalSection title="Contact us">
      <p>For questions or requests about your information:</p>
      <LegalContact details={details} whatsapp={whatsapp} />
    </LegalSection>
  </LegalLayout>;
}
