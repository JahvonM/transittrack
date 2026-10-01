package com.transittrack.kioskhelper;

import android.app.Activity;
import android.os.Bundle;

/** Opened by Android when the ACR122U is plugged in (this is what lets "Use by default" stick). */
public class UsbAttachActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Status.log("Card reader plugged in");
        HelperService.start(this);
        finish();
    }
}
