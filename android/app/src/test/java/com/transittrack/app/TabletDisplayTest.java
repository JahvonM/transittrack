package com.transittrack.app;

import android.app.Activity;
import android.content.Context;
import android.view.WindowManager;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, manifest=Config.NONE)
public class TabletDisplayTest {
    @Before public void reset() {
        RuntimeEnvironment.getApplication().getSharedPreferences("tablet_display", Context.MODE_PRIVATE).edit().clear().commit();
    }
    private boolean awake(Activity activity) {
        return (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0;
    }
    @Test public void existingTabletsDefaultToAwake() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        TabletDisplay.apply(activity);
        assertTrue(awake(activity));
    }
    @Test public void offSurvivesANewActivityAndCanBeEnabledAgain() {
        Activity first = Robolectric.buildActivity(Activity.class).setup().get();
        assertTrue(TabletDisplay.save(first, false));
        TabletDisplay.apply(first); assertFalse(awake(first));
        Activity reopened = Robolectric.buildActivity(Activity.class).setup().get();
        TabletDisplay.apply(reopened); assertFalse(awake(reopened));
        assertTrue(TabletDisplay.save(reopened, true));
        TabletDisplay.apply(reopened); assertTrue(awake(reopened));
    }
    @Test public void resumeDoesNotOverrideAnExplicitOffChoice() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        TabletDisplay.apply(activity); assertTrue(awake(activity));
        TabletDisplay.save(activity, false);
        TabletDisplay.apply(activity); TabletDisplay.apply(activity);
        assertFalse(awake(activity));
    }
}
