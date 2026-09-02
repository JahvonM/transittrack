import React from "react";
import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContactOperator({ company }) {
  const phone = (company?.phone || "").trim();
  if (!phone) return null;
  const whatsappDigits = phone.replace(/[^0-9]/g, "");
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href={`tel:${phone}`}>
          <Phone className="w-4 h-4" />
          Call operator
        </a>
      </Button>
      {whatsappDigits.length >= 8 && (
        <Button variant="outline" size="sm" asChild>
          <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
        </Button>
      )}
    </div>
  );
}