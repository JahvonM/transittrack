export const CARD_MM = { width: 85.6, height: 53.98 };
export const CARD_PX = { width: 1011, height: 638 }; // approximately 300 dpi
export const DEFAULT_CARD_DESIGN = { title: "TRANSITTRACK", subtitle: "PASSENGER CARD", color: "#0f766e", background: "#0f172a", text: "#ffffff", footer: "Tap your card when boarding", backText: "This card belongs to its named holder. If found, return it to your transport company.", logo: "", backgroundImage: "" };
const xml = value => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]);
const imageData = value => /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value || "") ? value : "";
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;

export function cardArtwork(design, person, side = "front", photo = "") {
  const d = { ...DEFAULT_CARD_DESIGN, ...design };
  const lines = (text, max = 48) => {
    const words = String(text || "").split(/\s+/); const result = []; let line = "";
    for (const word of words) { if ((line + " " + word).length > max && line) { result.push(line); line = word; } else line += (line ? " " : "") + word; }
    if (line) result.push(line);
    return result.slice(0, 8);
  };
  const name = String(person?.name || "Passenger name").slice(0, 80);
  const initials = name.split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
  const logo = imageData(d.logo), bg = imageData(d.backgroundImage), portrait = imageData(photo);
  let body = '<rect width="1011" height="638" fill="' + color(d.background, "#0f172a") + '"/>';
  if (bg) body += '<image href="' + bg + '" width="1011" height="638" preserveAspectRatio="xMidYMid slice" opacity=".3"/>';
  body += '<path d="M660 0H1011V638H870Z" fill="' + color(d.color, "#0f766e") + '" opacity=".6"/>';
  body += '<rect x="0" y="0" width="1011" height="150" fill="' + color(d.color, "#0f766e") + '"/>';
  if (logo) body += '<image href="' + logo + '" x="46" y="32" width="90" height="90" preserveAspectRatio="xMidYMid meet"/>';
  body += '<text x="' + (logo ? 160 : 48) + '" y="82" font-size="40" font-weight="700">' + xml(String(d.title || "").slice(0,32)) + '</text>';
  body += '<text x="' + (logo ? 160 : 48) + '" y="120" font-size="22" letter-spacing="4">' + xml(String(d.subtitle || "").slice(0,40)) + '</text>';
  if (side === "front") {
    body += '<rect x="48" y="195" width="220" height="285" rx="18" fill="#ffffff" opacity=".12"/>';
    if (portrait) body += '<image href="' + portrait + '" x="48" y="195" width="220" height="285" preserveAspectRatio="xMidYMid slice"/>';
    else body += '<text x="158" y="360" text-anchor="middle" font-size="72" font-weight="700">' + xml(initials) + '</text>';
    lines(name, 25).slice(0,3).forEach((l,i) => { body += '<text x="310" y="' + (245+i*50) + '" font-size="40" font-weight="700">' + xml(l) + '</text>'; });
    body += '<text x="310" y="440" font-size="24">' + xml(String(person?.company_name || "Company").slice(0,45)) + '</text>';
    body += '<text x="310" y="485" font-size="24">ID: ' + xml(String(person?.employee_id || "—").slice(0,40)) + '</text>';
  } else {
    lines(d.backText).forEach((l,i) => { body += '<text x="52" y="' + (220+i*38) + '" font-size="27">' + xml(l) + '</text>'; });
  }
  body += '<text x="48" y="585" font-size="23">' + xml(String(d.footer || "").slice(0,70)) + '</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="638" viewBox="0 0 1011 638" font-family="Arial, sans-serif" fill="' + color(d.text, "#ffffff") + '">' + body + '</svg>';
}

export async function artworkPng(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image(); img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = CARD_PX.width; canvas.height = CARD_PX.height;
    canvas.getContext("2d").drawImage(img,0,0);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
export async function localCardImage(file) {
  if (!file || !["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Use a PNG, JPEG or WebP image smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1200 / Math.max(img.width,img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
