// "Use two fingers to move the map" on the small map preview, one finger in
// full screen. mapbox-gl only builds its little "use two fingers" notice when
// the drag and scroll handlers are switched on, so turning the setting on
// later (map.setCooperativeGestures) left no notice, and the next one-finger
// drag crashed ("this._alertContainer.style"). Switch the handlers off and on
// around the change so the notice exists whenever the setting is on.
export function setCooperativeGestures(map, on) {
  if (!map?.setCooperativeGestures) return;
  const want = Boolean(on);
  if (Boolean(map.getCooperativeGestures?.()) === want) return;
  // Off while the old setting still applies, so they tidy up what that setting made.
  const handlers = [map.dragPan, map.scrollZoom].filter((h) => h?.isEnabled?.());
  for (const h of handlers) h.disable();
  map.setCooperativeGestures(want);
  for (const h of handlers) h.enable();
}
