import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import LegalContact, { useBusinessContact } from "@/components/legal/LegalContact";
import { cancellationRule } from "@/lib/appSupport";

// The Terms of Service (app /terms and the website's /terms). The contact
// details and the free-cancellation rule come from Admin -> Settings ->
// Business details; anything not set there is simply left out.
export const TERMS_UPDATED = "9 November 2026";

export default function TermsOfService() {
  const { details, whatsapp } = useBusinessContact();
  const rule = cancellationRule(details);

  return <LegalLayout title="Terms of Service">
    <p className="text-body-sm text-muted-foreground">Last updated {TERMS_UPDATED}.</p>

    <LegalSection title="Who we are">
      <p>Mc Sween’s Transport and Reside Co. (“McSween Transport”, “we”) runs airport pickups and drop-offs, transfers, island tours and staff transport in Grenada. These terms cover those rides and the McSween Transport website and app used to request, track and board them.</p>
      <p>By requesting a ride or using the app, you agree to these terms.</p>
    </LegalSection>

    <LegalSection title="Requesting a ride">
      <p>A ride request, from our website or a company’s portal, is not a booking yet. Your ride is booked once we confirm it by email. We may decline a request, for example when no bus is free, and we’ll tell you by email.</p>
      <p>Please give us accurate details: the pickup place and time, where you’re going, the number of passengers and bags and, for airport rides, your flight number. Check your confirmation email and tell us straight away if anything in it is wrong.</p>
      <p>Be ready at the agreed pickup place and time, and tell us as soon as you can if your plans or your flight change.</p>
    </LegalSection>

    <LegalSection title="Prices and payment">
      <p>The price is the one agreed with you, or with your company, when the ride is confirmed. When a price has been agreed it is shown in your confirmation email. Payment is made as agreed with you or your company. Company transport follows the company’s own agreement with us.</p>
    </LegalSection>

    <LegalSection title="Cancelling or changing a ride">
      <p>If you need to cancel, tell us as early as possible: reply to your confirmation email or contact us using the details below.{rule ? ` ${rule}` : ""}</p>
      <p>If we have to cancel your ride, we’ll email you as soon as we can.</p>
      <p>Traffic, weather, flight delays or safety can delay or change a ride. When that happens we’ll keep you informed as best we can.</p>
    </LegalSection>

    <LegalSection title="Tracking your ride">
      <p>Your confirmation email can include a link that shows where your bus is. It shows only your ride. Share it only with the people travelling with you or meeting you.</p>
      <p>Bus positions and arrival times come from live location data. They can be late or unavailable, so go by the agreed pickup time and any message from us, rather than by the estimate alone.</p>
    </LegalSection>

    <LegalSection title="Staff transport and boarding">
      <p>Use only the account, card and codes given to you. Keep them safe, and tell your company’s transport office at once about a lost card or anything that looks like misuse.</p>
      <p>When you get on the bus, tap your card, show your QR code or type your code on the boarding tablet, and check its screen says it was recorded. Where the bus records getting off too, tap again when you get off. Sending a code to the bus by Bluetooth is not proof you boarded until the tablet confirms it.</p>
      <p>Buses can run from home pickup spots to the workplace or the other way round. Check the direction, your pickup point and the service details, and tell the transport office if anything is wrong.</p>
    </LegalSection>

    <LegalSection title="Safety">
      <p>Follow the driver’s instructions and wear a seat belt where one is fitted. Drivers must not use the app while driving; they stop safely first.</p>
      <p>The app’s SOS and reporting tools do not replace the emergency services. In an emergency, call them directly.</p>
      <p>Bus location sharing, tablet management, live camera viewing and dashcam recording are described in the Privacy Policy. Companies are responsible for telling their staff about them and for using their tablets as agreed.</p>
    </LegalSection>

    <LegalSection title="Using the app and website">
      <p>Don’t use someone else’s account or codes, give false information, interfere with the service, or use messages to threaten or harass anyone. We may suspend access that is misused.</p>
      <p>The app depends on devices, internet access and other providers. Some work can be saved on a device and sent later: “saved” or “waiting to send” is not the same as confirmed. Don’t clear a tablet’s storage, uninstall it or change what it’s assigned to while it still has unsent work.</p>
      <p>Dashcam clips are kept on the tablet and are not backed up automatically. Keep any clip you need using the app’s controls before older clips are removed.</p>
    </LegalSection>

    <LegalSection title="Responsibilities">
      <p>Companies are responsible for the information they give us and for the people, permissions and arrangements under their control. Nothing in these terms takes away rights you have by law.</p>
    </LegalSection>

    <LegalSection title="Your account and contacting us">
      <p>You can ask for your account profile to be deleted in My Account. Some records of rides and operations are kept, as described in the Privacy Policy.</p>
      <LegalContact details={details} whatsapp={whatsapp} />
    </LegalSection>
  </LegalLayout>;
}
