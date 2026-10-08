import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

// Public page. The URL for this page is the privacy policy link the app stores
// require. Edit the wording below to match your company.
export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy">
      <LegalSection title="1. Who we are">
        <p>
          [COMPANY NAME] ("we", "us") operates the TransitTrack transport management service and
          mobile application. We provide staff bus and taxi coordination, live vehicle tracking and
          boarding verification for companies and their employees.
        </p>
        <p>
          Registered address: [COMPANY ADDRESS]. You can reach us about privacy at [CONTACT EMAIL].
        </p>
        <p>Effective date: [EFFECTIVE DATE]. Last updated: [EFFECTIVE DATE].</p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>We collect only what we need to run the transport service:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-foreground">Account details.</span> Your name, email
            address, profile photo, phone number, password and your role in the service, such as
            passenger, driver, company manager or administrator.
          </li>
          <li>
            <span className="font-semibold text-foreground">Location data.</span> Precise GPS
            location of vehicles and of the device running the driver app, so passengers can see
            where a bus or taxi is and when it will arrive. See section 4 for when this is
            collected.
          </li>
          <li>
            <span className="font-semibold text-foreground">Boarding and check-in records.</span>{" "}
            Which service a passenger boarded, the time, and the method used, such as an NFC card,
            QR code, access code or a manual entry by staff.
          </li>
          <li>
            <span className="font-semibold text-foreground">Trip records.</span> Pickup and drop-off
            points, scheduled times, trip status, and signatures or photos captured at pickup and
            drop-off.
          </li>
          <li>
            <span className="font-semibold text-foreground">Messages and reports.</span> Text,
            photo and voice messages sent in the app's chat, plus incident, lost item and safety
            reports you submit.
          </li>
          <li>
            <span className="font-semibold text-foreground">Device and technical data.</span> Device
            type, operating system, app version, tablet identifier for company-owned tablets, and
            push notification tokens.
          </li>
          <li>
            <span className="font-semibold text-foreground">Activity records.</span> An internal
            audit log of actions taken in the management console, such as changes to vehicles,
            staff records or company settings.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use your information">
        <ul className="list-disc space-y-2 pl-5">
          <li>To show passengers and dispatch where a vehicle is and estimate its arrival.</li>
          <li>To verify that a passenger or staff member is authorised to board a service.</li>
          <li>To plan routes, schedules and pickups, and to operate company transport services.</li>
          <li>To send service notifications, arrival alerts and messages you have opted into.</li>
          <li>To investigate safety incidents, accidents and reports submitted through the app.</li>
          <li>To maintain security, prevent misuse and keep an audit trail of changes.</li>
          <li>To provide support and to fix faults in the app.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use your location data for
          advertising.
        </p>
      </LegalSection>

      <LegalSection title="4. When location is collected">
        <p>
          Location is collected only while tracking is active, which means during an open driver
          shift or while a company tablet is paired and running a service. Tracking stops when the
          shift ends or when tracking is switched off. The app does not collect your location in the
          background outside those periods.
        </p>
        <p>
          If you use the passenger app, your location is used only when you choose to share it, for
          example to find your nearest stop or to send your position to a driver.
        </p>
        <p>
          You can withdraw location permission at any time in your device settings. Tracking and
          arrival estimates will stop working for that device.
        </p>
      </LegalSection>

      <LegalSection title="5. Who can see your information">
        <p>
          Your information is visible to the people who need it to run your transport service:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Administrators and managers of the company you belong to, who can see vehicles, trips,
            boarding records and staff records for that company.
          </li>
          <li>
            Drivers, who see the passengers assigned to their service and the stops on their route.
          </li>
          <li>
            Our support staff, where access is needed to resolve a fault or a reported incident.
          </li>
        </ul>
        <p>
          Companies using TransitTrack are separate. Data belonging to one company is not visible to
          another company.
        </p>
      </LegalSection>

      <LegalSection title="6. Service providers">
        <p>
          We use a small number of suppliers to operate the service. They process data only on our
          instructions:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-foreground">Mapping and geocoding</span> providers,
            to display maps, calculate routes and convert addresses into map coordinates.
          </li>
          <li>
            <span className="font-semibold text-foreground">Cloud hosting and messaging</span>{" "}
            providers, to store data and deliver push notifications to your device.
          </li>
          <li>
            <span className="font-semibold text-foreground">Email delivery</span> providers, to send
            verification codes, invitations and account emails.
          </li>
        </ul>
        <p>We may also disclose information where the law requires it.</p>
      </LegalSection>

      <LegalSection title="7. How long we keep it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-foreground">Location history:</span> retained for
            [RETENTION PERIOD], then deleted.
          </li>
          <li>
            <span className="font-semibold text-foreground">Trip and boarding records:</span>{" "}
            retained for [RETENTION PERIOD] for operational and accounting purposes.
          </li>
          <li>
            <span className="font-semibold text-foreground">Incident and safety reports:</span>{" "}
            retained for [RETENTION PERIOD] in case of an insurance or legal claim.
          </li>
          <li>
            <span className="font-semibold text-foreground">Account data:</span> kept while your
            account is active, then deleted within [RETENTION PERIOD] of account closure.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          Data is transmitted over encrypted connections and access is limited by role, so that
          people see only what their job requires. Company tablets are locked to a single assigned
          vehicle. No system is perfectly secure, but we take reasonable steps to protect the
          information we hold and we review access regularly.
        </p>
      </LegalSection>

      <LegalSection title="9. Your choices and rights">
        <ul className="list-disc space-y-2 pl-5">
          <li>You can view and change your name, photo and phone number in My Account.</li>
          <li>
            You can delete your account from My Account. This removes your personal profile and
            signs you out of the app.
          </li>
          <li>
            You can turn off location, camera, microphone and notification permissions in your
            device settings. Some features will stop working.
          </li>
          <li>
            You can ask us for a copy of your personal information, ask us to correct it, or ask us
            to delete it by writing to [CONTACT EMAIL].
          </li>
        </ul>
        <p>
          Depending on where you live, you may have further rights under local data protection law.
          Contact us and we will respond within the period the law allows.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>
          TransitTrack is a workplace transport service and is not intended for children under
          [MINIMUM AGE]. We do not knowingly collect personal information from children. If you
          believe a child has provided us with personal information, contact us at [CONTACT EMAIL]
          and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="11. Where your data is stored">
        <p>
          Our providers may store data in countries other than the one you live in. Where we
          transfer personal information across borders, we take steps to ensure it remains protected
          to the standard described in this policy.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to this policy">
        <p>
          We may update this policy as the service changes. We will change the "last updated" date
          above and, for significant changes, notify you in the app or by email.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact us">
        <p>
          Questions about this policy, or about your personal information, can be sent to [CONTACT
          EMAIL] or by post to [COMPANY ADDRESS].
        </p>
      </LegalSection>
    </LegalLayout>
  );
}