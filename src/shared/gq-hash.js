var CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function fnv1a(str2) {
  let h2 = 2166136261;
  for (let i = 0; i < str2.length; i++) {
    h2 ^= str2.charCodeAt(i);
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return h2.toString(16).padStart(8, "0");
}
var URLISH = /^[(\[]?(?:[a-z][a-z0-9+.-]*:\/\/\S*|[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?)[)\].,;:!?]*$/i;
export function fingerprintText(text) {
  const tokens = String(text || "").replace(/[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, "").toLowerCase().split(/\s+/).filter((t) => t && !URLISH.test(t));
  const letters = (tokens.join(" ").match(new RegExp("\\p{L}+", "gu")) || []).join("");
  return { len: letters.length, h: fnv1a(letters) };
}
