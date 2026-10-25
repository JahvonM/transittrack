// Facing-mode support varies across Android WebViews. Fall back only for a
// missing/unsupported camera, never for denied permission or a camera in use.
export async function startQrCamera(scanner, facingMode, exact, config, decode, miss) {
  try {
    return await scanner.start({ facingMode: exact ? { exact: facingMode } : facingMode }, config, decode, miss);
  } catch (error) {
    const message = `${error?.name || ''} ${error?.message || error || ''}`;
    if (exact || !/NotFound|Overconstrained|ConstraintNotSatisfied|facingMode/i.test(message)) throw error;
    const cameras = await scanner.constructor.getCameras?.();
    const preferred = cameras?.find(camera => (facingMode === 'environment' ? /back|rear|environment/i : /front|user/i).test(camera.label));
    const camera = preferred || cameras?.[0];
    return scanner.start(camera?.id || { facingMode: { ideal: facingMode } }, config, decode, miss);
  }
}
