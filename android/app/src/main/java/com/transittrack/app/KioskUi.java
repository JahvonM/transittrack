package com.transittrack.app;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;

/**
 * The look of the native kiosk screens (kiosk settings, exit code, rear
 * camera): dark sea-ink ground, rounded panels, large touch targets, sun
 * yellow for the one main action. Built in code like the rest of the native
 * screens, so there are no layout files to keep in step.
 */
final class KioskUi {
    static final int INK = 0xFF0B1D22, SURFACE = 0xFF13292F, SURFACE_HIGH = 0xFF163A42, FIELD = 0xFF0E2328;
    static final int LINE = 0xFF22404A, BORDER = 0xFF2A4A53, TEXT = 0xFFEEF6F5, SOFT = 0xFFB9CFCD, MUTED = 0xFF9BB6B4;
    static final int TEAL = 0xFF5FD0DE, TEAL_DARK = 0xFF2BB3C6, SUN = 0xFFF7C948, GOOD = 0xFF4FD18B, WARN = 0xFFF7C948;
    static final int BAD = 0xFFFF9B94, RECORD = 0xFFFF5A5F, RECORD_INK = 0xFF1A0607, PRESS = 0x33FFFFFF;
    static final Typeface MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    static final Typeface BOLD = Typeface.create("sans-serif", Typeface.BOLD);

    enum Style { PRIMARY, SECONDARY, QUIET, DANGER, RECORD, KEY }

    private KioskUi() { }

    static int dp(Context c, float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, c.getResources().getDisplayMetrics()));
    }
    /** Landscape tablets get the side menu; phones get tabs across the top. */
    static boolean wide(Context c) {
        return c.getResources().getConfiguration().screenWidthDp >= 720;
    }
    static GradientDrawable shape(Context c, int fill, float radius, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(c, radius));
        if (stroke != 0) d.setStroke(dp(c, 1.5f), stroke);
        return d;
    }
    static Drawable pressable(Context c, int fill, float radius, int stroke) {
        return new RippleDrawable(ColorStateList.valueOf(PRESS), shape(c, fill, radius, stroke), shape(c, 0xFFFFFFFF, radius, 0));
    }

    static TextView text(Context c, CharSequence value, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.2f);
        return t;
    }
    static TextView title(Context c, CharSequence value, float sp) {
        TextView t = text(c, value, sp, TEXT);
        t.setTypeface(BOLD);
        t.setLineSpacing(0, 1.1f);
        return t;
    }
    static TextView label(Context c, CharSequence value) {
        TextView t = text(c, value, 15, MUTED);
        t.setTypeface(MEDIUM);
        return t;
    }

    static Button button(Context c, String label, Style style, Runnable action) {
        Button b = new Button(c);
        b.setText(label);
        b.setAllCaps(false);
        b.setTypeface(style == Style.KEY ? Typeface.create("sans-serif", Typeface.NORMAL) : MEDIUM);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, style == Style.KEY ? 30 : 17);
        b.setMinHeight(dp(c, style == Style.KEY ? 84 : 56));
        b.setMinimumHeight(dp(c, style == Style.KEY ? 84 : 56));
        b.setPadding(dp(c, 22), 0, dp(c, 22), 0);
        b.setGravity(Gravity.CENTER);
        if (Build.VERSION.SDK_INT >= 21) b.setStateListAnimator(null);
        int fill, ink, stroke = 0;
        switch (style) {
            case PRIMARY: fill = SUN; ink = INK; break;
            case DANGER: fill = 0; ink = BAD; stroke = 0xFF6B3A3A; break;
            case RECORD: fill = RECORD; ink = RECORD_INK; break;
            case KEY: fill = SURFACE; ink = TEXT; break;
            case QUIET: fill = 0; ink = SOFT; stroke = BORDER; break;
            default: fill = SURFACE_HIGH; ink = TEXT; stroke = BORDER;
        }
        b.setTextColor(ink);
        b.setBackground(pressable(c, fill, style == Style.KEY ? 18 : 14, stroke));
        if (action != null) b.setOnClickListener(v -> action.run());
        return b;
    }
    static void enable(View v, boolean on) {
        v.setEnabled(on);
        v.setAlpha(on ? 1f : 0.45f);
    }

    static LinearLayout column(Context c, int gapDp) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        if (gapDp > 0) l.setDividerDrawable(spacer(c, gapDp));
        if (gapDp > 0) l.setShowDividers(LinearLayout.SHOW_DIVIDER_MIDDLE);
        return l;
    }
    static LinearLayout row(Context c, int gapDp) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        if (gapDp > 0) { l.setDividerDrawable(spacer(c, gapDp)); l.setShowDividers(LinearLayout.SHOW_DIVIDER_MIDDLE); }
        return l;
    }
    private static Drawable spacer(Context c, int dp) {
        GradientDrawable d = new GradientDrawable();
        d.setSize(dp(c, dp), dp(c, dp));
        d.setColor(0);
        return d;
    }
    /** A rounded panel; children are added by the caller. */
    static LinearLayout panel(Context c) {
        LinearLayout l = column(c, 0);
        l.setBackground(shape(c, SURFACE, 16, 0));
        return l;
    }
    static View line(Context c) {
        View v = new View(c);
        v.setBackgroundColor(LINE);
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(c, 1))));
        return v;
    }
    static View dot(Context c, int color) {
        View v = new View(c);
        v.setBackground(shape(c, color, 99, 0));
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(c, 10), dp(c, 10)));
        return v;
    }
    static LinearLayout.LayoutParams fill() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    static LinearLayout.LayoutParams weight(float w) { return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w); }

    /** A heading inside a panel: "When the tablet starts". */
    static TextView panelHeading(Context c, String value) {
        TextView t = label(c, value);
        t.setPadding(dp(c, 22), dp(c, 16), dp(c, 22), dp(c, 4));
        return t;
    }
    /** A settings row: title, optional detail, and something on the right. */
    static LinearLayout settingRow(Context c, String title, String detail, View trailing) {
        LinearLayout r = row(c, 18);
        r.setMinimumHeight(dp(c, 72));
        r.setPadding(dp(c, 22), dp(c, 10), dp(c, 22), dp(c, 10));
        LinearLayout words = column(c, 3);
        words.addView(text(c, title, 18, TEXT));
        if (detail != null && !detail.isEmpty()) words.addView(text(c, detail, 14, MUTED));
        r.addView(words, weight(1));
        if (trailing != null) r.addView(trailing);
        return r;
    }
    static Switch toggle(Context c, String accessibleName, boolean on) {
        Switch s = new Switch(c);
        s.setChecked(on);
        s.setContentDescription(accessibleName);
        s.setMinimumHeight(dp(c, 48));
        if (Build.VERSION.SDK_INT >= 23) {
            int[][] states = { { android.R.attr.state_checked }, { } };
            s.setThumbTintList(new ColorStateList(states, new int[] { TEAL, 0xFFC8DCDA }));
            s.setTrackTintList(new ColorStateList(states, new int[] { 0xFF1F6F7A, 0xFF35535B }));
        }
        return s;
    }
    /** Status: a coloured dot and words (never colour alone). */
    static LinearLayout status(Context c, int color, String words, float sp) {
        LinearLayout r = row(c, 10);
        r.addView(dot(c, color));
        TextView t = text(c, words, sp, TEXT);
        t.setTypeface(MEDIUM);
        r.addView(t);
        return r;
    }
    static EditText field(Context c, String hint, boolean secret) {
        EditText e = new EditText(c);
        e.setHint(hint);
        e.setTextColor(TEXT);
        e.setHintTextColor(0xFF6F8C8A);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        e.setSingleLine(true);
        e.setEllipsize(TextUtils.TruncateAt.END);
        e.setMinHeight(dp(c, 52));
        e.setPadding(dp(c, 14), 0, dp(c, 14), 0);
        e.setBackground(shape(c, FIELD, 12, BORDER));
        e.setSaveEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        e.setInputType(secret ? android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            : android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        return e;
    }
    static ScrollView scroll(Context c, View child) {
        ScrollView s = new ScrollView(c);
        s.setFillViewport(true);
        s.addView(child);
        return s;
    }
    static String clock(long seconds) {
        long s = Math.max(0, seconds);
        return String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60);
    }
}
