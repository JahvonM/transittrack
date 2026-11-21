import { base44 } from "@/api/base44Client";

// Manuals on a model page (GuideDocument) are private files: added only by
// uploading them in the app, and opened through a link that lasts five
// minutes. Used by the Workshop's Manuals and the Bus library's old view.

export async function uploadGuideDocument({ guideId, title, kind, notes, file }) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  return base44.entities.GuideDocument.create({
    guide_id: guideId, title: String(title).trim(), kind, notes: String(notes || "").trim(), file_uri, file_name: file.name,
  });
}

// Opens a manual in a new tab. The tab opens during the tap, before the link
// arrives, so pop-up blockers allow it. Throws when the link can't be made
// (the new tab is closed again).
export async function openGuideDocument(doc) {
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  try {
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 300 });
    if (win) win.location.href = signed_url; else window.location.assign(signed_url);
  } catch (e) {
    win?.close();
    throw e;
  }
}
