import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

// Public page. The URL for this page is the terms of use link the app stores
// require. Edit the wording below to match your company.
export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service">
      <LegalSection title="1. Agreement">
        <p>
          These terms are an agreement between you and [COMPANY NAME] ("we", "us") covering your use
          of the TransitTrack application and the transport services booked or coordinated through
          it. By creating an account or using the app, you accept these terms. If you do not accept
          them, do not use the app.
        </p>
        <p>
          Registered address: [COMPANY ADDRESS]. Contact: [CONTACT EMAIL]. Effective date:
          [EFFECTIVE DATE].
        </p>
      </LegalSection>

      <LegalSection title="2. Who may use the app">
        <p>
          You must be at least [MINIMUM AGE] and able to enter into a binding agreement. If you use
          the app on behalf of a company, you confirm you are authorised to accept these terms for
          that company.
        </p>
        <p>
          Accounts are personal. Keep your password confidential and do not share your account,
          boarding code or NFC card with anyone else. Tell us promptly at [CONTACT EMAIL] if you
          believe your account has been used without your permission.
        </p>
        <p>
          Access is granted according to your role. Passengers see their own trips, drivers see the
          services assigned to them, and company managers and administrators see the records for
          their own company.
        </p>
      </LegalSection>

      <LegalSection title="3. Location tracking and monitoring">
        <p>
          The service depends on location. By using the app in a driver, tablet or company role, you
          agree that the device you use may report its location while a shift is open or a service
          is running, so that dispatch and passengers can see the vehicle.
        </p>
        <p>
          You also agree that boarding, check-in and trip records may be created and retained as
          described in our Privacy Policy, and that company-owned tablets may be locked to a single
          assigned vehicle.
        </p>
        <p>
          Tracking stops when the shift ends or when tracking is switched off. You may withdraw
          location permission in your device settings, but the app cannot then perform its core
          function.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the app for anything unlawful, or to carry anything unlawful.</li>
          <li>
            Share your account, boarding pass, access code or NFC card, or use another person's.
          </li>
          <li>Interfere with, damage or attempt to gain unauthorised access to the app.</li>
          <li>Submit false boarding, trip, incident or safety reports.</li>
          <li>Use the app's chat to harass, threaten or abuse anyone.</li>
          <li>Copy, resell or reverse engineer any part of the service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Boarding, cards and access codes">
        <p>
          Boarding passes, NFC cards and access codes are issued to a named person and are not
          transferable. A driver or boarding tablet may refuse boarding where a pass cannot be
          verified, where the pass does not match the service, or where it has been reported lost or
          revoked.
        </p>
        <p>
          Report a lost card or compromised code immediately so it can be disabled. You are
          responsible for any use of your credentials before you report them lost.
        </p>
      </LegalSection>

      <LegalSection title="6. The transport service">
        <p>
          Transport is provided by [COMPANY NAME] or by the operating company named on your booking.
          Timetables, routes, stops and vehicle assignments may change for operational, weather or
          safety reasons.
        </p>
        <p>
          Arrival estimates are calculated from live vehicle positions and road conditions. They are
          estimates only and are not guaranteed. Traffic, breakdowns and other events can cause
          delays, and we are not liable for a missed connection or appointment.
        </p>
        <p>Please be at your pickup point at least [MINUTES] minutes before the scheduled time.</p>
      </LegalSection>

      <LegalSection title="7. Safety and emergencies">
        <p>
          Follow the instructions of the driver and any safety notices in the vehicle. Wear a seat
          belt where one is fitted, remain seated while the vehicle is moving, and do not distract
          the driver.
        </p>
        <p>
          <span className="font-semibold text-foreground">
            The in-app SOS and incident reporting features are not a substitute for emergency
            services.
          </span>{" "}
          In an emergency, contact the local emergency number first, then report the incident in the
          app so we can respond.
        </p>
      </LegalSection>

      <LegalSection title="8. Company responsibilities">
        <p>
          If you use TransitTrack as a company, you are responsible for the vehicles, drivers and
          staff you register, for holding the licences and insurance your operations require, for
          the accuracy of the routes and stop information you enter, and for informing your staff
          about the location tracking and monitoring described in these terms and in our Privacy
          Policy.
        </p>
      </LegalSection>

      <LegalSection title="9. Fees">
        <p>
          Fees, if any, are set out in your agreement with us or in the order you place. Unless
          stated otherwise, fees are payable [PAYMENT TERMS] and are exclusive of applicable taxes.
        </p>
      </LegalSection>

      <LegalSection title="10. Our intellectual property">
        <p>
          The app, its design, software and content are owned by us or our licensors and are
          protected by law. We grant you a limited, non-transferable right to use the app for its
          intended purpose while these terms apply. All other rights are reserved.
        </p>
      </LegalSection>

      <LegalSection title="11. Availability and disclaimers">
        <p>
          We aim to keep the app available and accurate, but it is provided "as is". We do not
          promise uninterrupted or error-free operation. Maps, positions and estimates depend on
          GPS, mobile networks and third-party mapping data, and may be delayed, incomplete or
          unavailable.
        </p>
      </LegalSection>

      <LegalSection title="12. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for indirect or consequential
          loss, loss of profit, or for delays, missed connections or missed appointments arising
          from the use of the app. Nothing in these terms limits liability that cannot lawfully be
          limited, including liability for death or personal injury caused by negligence, or for
          fraud.
        </p>
      </LegalSection>

      <LegalSection title="13. Suspension and termination">
        <p>
          You may stop using the app at any time and may delete your account from My Account. We may
          suspend or end your access if you breach these terms, if your credentials are misused, if
          the law requires it, or if we withdraw the service. Where we end access without cause, we
          will give reasonable notice.
        </p>
      </LegalSection>

      <LegalSection title="14. Governing law">
        <p>
          These terms are governed by the laws of [JURISDICTION], and the courts of [JURISDICTION]
          have exclusive jurisdiction over any dispute, unless the law where you live gives you the
          right to bring proceedings locally.
        </p>
      </LegalSection>

      <LegalSection title="15. Changes to these terms">
        <p>
          We may update these terms as the service changes. We will change the "effective date"
          above and, for significant changes, notify you in the app or by email. Continuing to use
          the app after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="16. Contact">
        <p>
          Questions about these terms can be sent to [CONTACT EMAIL] or by post to [COMPANY
          ADDRESS].
        </p>
      </LegalSection>
    </LegalLayout>
  );
}