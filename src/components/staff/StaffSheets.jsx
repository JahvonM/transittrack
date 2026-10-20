import React from "react";
import { Link } from "react-router-dom";
import { Drawer } from "vaul";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LogOut, MessageCircle, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { waLink } from "@/lib/mapbox";
import { accountName } from "@/lib/userName";
import LostItemReport from "@/components/staff/LostItemReport";
import OneTimeCode from "@/components/staff/OneTimeCode";
import StaffGroupChat from "@/components/staff/StaffGroupChat";
import StopChooser from "@/components/passenger/StopChooser";
import PickupSelector from "@/components/passenger/PickupSelector";

// The passenger sheets, Apple style: the sheet follows the finger, a flick
// or a pull past a quarter of its height closes it, pulling up past the top
// resists, and it opens and closes along the same path. Maps inside are
// marked data-vaul-no-drag so panning them doesn't move the sheet.
// The sheet itself never scrolls: an inner area does. vaul paints the sheet's
// background just below it (so a pull never shows a gap), and inside a
// scrolling sheet that strip would ride up over the content.
function BottomSheet({ open, onOpenChange, title, description, children, tall = false, pickup = false }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="tt-apple-overlay fixed inset-0 z-50 bg-black/80" />
        <Drawer.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={`tt-safe-sheet tt-apple-sheet ${pickup ? "tt-pickup-sheet " : ""}fixed inset-x-0 bottom-0 z-50 flex flex-col border-t bg-background p-6 shadow-lg max-w-2xl mx-auto rounded-t-3xl safe-area-bottom outline-none ${tall ? "h-[88vh]" : "max-h-[88vh]"}`}
        >
          <div className="tt-sheet-grabber" aria-hidden="true" />
          <Drawer.Close className="tt-sheet-close absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Drawer.Close>
          <div className={`min-h-0 overflow-y-auto ${tall ? "flex-1 flex flex-col" : ""}`}>
            <div className={pickup ? "sr-only" : "flex flex-col space-y-2 text-left"}>
              <Drawer.Title className="tt-sheet-title text-lg font-semibold text-foreground">{title}</Drawer.Title>
              {description && <Drawer.Description className="tt-sheet-desc text-sm text-muted-foreground">{description}</Drawer.Description>}
            </div>
            <div className={`mt-4 ${tall ? "flex-1 min-h-0 flex flex-col" : ""}`}>{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

export function MyPickupSheet({ open, onOpenChange, pickupName, pickupOptions, routes, userLoc, onChoosePickup, bus }) {
  return <BottomSheet open={open} onOpenChange={onOpenChange} title="Pickup" tall pickup>
    <PickupSelector options={pickupOptions} routes={routes} userLoc={userLoc} value={pickupName} onChoose={onChoosePickup} intro={false} onConfirmed={() => onOpenChange(false)} bus={bus} />
  </BottomSheet>;
}

export function PassengerSettingsSheet({ open, onOpenChange, stopAlerts, onToggleStopAlerts, pushUnsupported, companyPhone, onSwitchCompany }) {
  const { user, checkUserAuth } = useAuth();
  const waOptIn = waLink(companyPhone, `Hi, this is ${accountName(user)}. I'd like to receive staff bus updates via WhatsApp.`);
  const linkWhatsapp = async () => {
    await base44.auth.updateMe({ whatsapp_linked: true }).catch(() => {});
    checkUserAuth?.();
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Notifications" description="Manage arrival alerts and company updates.">
      <div className="space-y-6 pb-4">
        <Button asChild variant="outline" className="w-full"><Link to="/notifications">View company announcements</Link></Button>
        <Section title="Arrival alerts">
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border px-3 py-3">
            <Switch checked={stopAlerts} onCheckedChange={onToggleStopAlerts} aria-label="Alert me when a bus is one stop away" />
            <span className="text-sm flex-1">
              Alert me when a bus is one stop away
              {stopAlerts && pushUnsupported && (
                <span className="block text-xs text-muted-foreground">This device can't show notifications. Add the app to your home screen to get them.</span>
              )}
            </span>
          </label>
        </Section>

        {companyPhone && (
          <Section title="WhatsApp updates">
            {user?.whatsapp_linked ? (
              <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="w-4 h-4" /> WhatsApp linked</p>
            ) : (
              <Button asChild variant="outline" className="w-full justify-start">
                <a href={waOptIn} target="_blank" rel="noopener noreferrer" onClick={linkWhatsapp}>
                  <MessageCircle className="w-4 h-4 mr-2" /> Link my WhatsApp
                </a>
              </Button>
            )}
          </Section>
        )}

        <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={onSwitchCompany}>
          <LogOut className="w-4 h-4 mr-2" /> Switch company
        </Button>
      </div>
    </BottomSheet>
  );
}

export function HelpSheet({ open, onOpenChange, company, vehicles }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Help" description="Lost something, or want to check the safety rules?">
      <div className="space-y-6 pb-4">
        <Section title="Report a lost item">
          <LostItemReport company={company} vehicles={vehicles} />
        </Section>
        <Button asChild variant="outline" className="w-full justify-start">
          <Link to="/safety-standards"><ShieldCheck className="w-4 h-4 mr-2" /> Safety standards</Link>
        </Button>
      </div>
    </BottomSheet>
  );
}

export function BadgeSheet({ open, onOpenChange }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Bus boarding" description="Your permanent QR and personal boarding code.">
      <div className="pb-4">{open && <OneTimeCode autoGenerate />}</div>
    </BottomSheet>
  );
}

export function ChatSheet({ open, onOpenChange, vehicle }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} tall title={vehicle ? `${vehicle.name} chat` : "Bus chat"} description="Your driver and the staff on this bus.">
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StaffGroupChat vehicle={vehicle} />
        </div>
      </div>
    </BottomSheet>
  );
}

export function StopSheet({ open, onOpenChange, routes, value, onChoose, userLoc }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Where do you get on?" description="Your stop decides which bus and arrival time you see.">
      <div className="-mx-6 pb-4">
        <StopChooser routes={routes} value={value} userLoc={userLoc} intro={false} onChoose={async (name) => { await onChoose(name); onOpenChange(false); }} />
      </div>
    </BottomSheet>
  );
}
