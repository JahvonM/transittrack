import React from "react";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";

export default function Account() {
  return (
    <AppLayout title="My account">
      <div className="max-w-xl">
        <ProfileInfo />
      </div>
    </AppLayout>
  );
}