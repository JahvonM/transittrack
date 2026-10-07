import React from "react";
import BoardingPass from "@/components/staff/BoardingPass";

// Keep the existing badge-sheet entry point while moving to permanent passes.
export default function OneTimeCode() {
  return <BoardingPass />;
}