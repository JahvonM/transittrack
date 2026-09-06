import React from "react";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import ChangePassword from "@/components/ChangePassword";

export default function Account() {
  return (
    <AppLayout title="My account">
      <div className="max-w-xl space-y-4">
        <ProfileInfo />
        <ChangePassword />
      </div>
    </AppLayout>
  );
}