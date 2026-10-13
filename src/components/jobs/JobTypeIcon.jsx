import React from "react";
import { Car, PlaneLanding, PlaneTakeoff, TreePalm, Users } from "lucide-react";
import { jobTypeOf } from "@/lib/jobs";

export const JOB_ICONS = { airport_pickup: PlaneLanding, airport_dropoff: PlaneTakeoff, hotel_tour: TreePalm, staff_run: Users, transfer: Car };

export default function JobTypeIcon({ trip, type, className = "h-4 w-4" }) {
  const Icon = JOB_ICONS[type || jobTypeOf(trip)] || Car;
  return <Icon className={className} aria-hidden="true" />;
}
