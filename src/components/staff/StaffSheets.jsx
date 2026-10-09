import React from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MobileSelect } from "@/components/ui/mobile-select";
import { CheckCircle2, LogOut, MessageCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { waLink } from "@/lib/mapbox";
import { accountName } from "@/lib/userName";
import LostItemReport from "@/components/staff/LostItemReport";
import OneTimeCode from "@/components/staff/OneTimeCode";
import StaffGroupChat from "@/components/staff/StaffGroupChat";
import BusAssistant from "@/components/BusAssistant";
import StopChooser from "@/components/passenger/StopChooser";
import PickupSelector from "@/components/passenger/PickupSelector";

function BottomSheet({ open, onOpenChange, title, description, children, tall = false, pickup = false }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={`${pickup ? "tt-pickup-sheet " : ""}max-w-2xl mx-auto rounded-t-3xl overflow-y-auto safe-area-bottom ${tall ? "h-[88vh] flex flex-col" : "max-h-[88vh]"}`}>
        <SheetHeader className={pickup ? "sr-only" : "text-left"}>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className={`mt-4 ${tall ? "flex-1 min-h-0 flex flex-col" : ""}`}>{children}</div>
      </SheetContent>
    </Sheet>
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

export function MyPickupSheet({ open, onOpenChange, pickupName, pickupOptions, routes, userLoc, onChoosePickup }) {
  return <BottomSheet open={open} onOpenChange={onOpenChange} title="Pickup" tall pickup>
    <PickupSelector options={pickupOptions} routes={routes} userLoc={userLoc} value={pickupName} onChoose={onChoosePickup} intro={false} onConfirmed={() => onOpenChange(false)} />
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

export function ChatSheet({ open, onOpenChange, vehicle, vehicles, chosenVehicleId, onChooseVehicle }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} tall title={vehicle ? `${vehicle.name} chat` : "Bus chat"} description="Your driver and the staff on this bus.">
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StaffGroupChat vehicle={vehicle} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
          <span>Wrong bus?</span>
          <MobileSelect
            value={chosenVehicleId || "auto"}
            onValueChange={onChooseVehicle}
            placeholder="Auto-detected"
            options={[{ value: "auto", label: "Auto-detect" }, ...vehicles.map((v) => ({ value: v.id, label: v.name }))]}
            triggerClassName="h-8 text-xs w-auto"
          />
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

export function AssistantSheet({ open, onOpenChange, company, userLoc }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Ask about your bus" description="Quick answers about times, stops and where your bus is.">
      <div className="pb-4">{open && <BusAssistant company={company} userLoc={userLoc} bare />}</div>
    </BottomSheet>
  );
}