import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { homeFor } from "@/lib/roleHome";

// A page only some kinds of account may open. Anyone else typing its address
// goes to their own home screen instead of seeing controls they can't use.
// The server still checks every read and write; this only keeps the screens
// honest. Used inside ProtectedRoute, so the person is already signed in.
export const PASSENGER_ROLES = ["staff", "passenger"];

export function allowedFor(user, allow) {
  return !!user && allow.includes(user.role || "staff");
}

export default function RoleGate({ allow, children }) {
  const { user } = useAuth();
  if (user && !allowedFor(user, allow)) return <Navigate to={homeFor(user)} replace />;
  return children;
}
