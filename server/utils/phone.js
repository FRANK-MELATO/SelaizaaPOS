/**
 * Normalize a phone number to a canonical, comparable form.
 *
 * Customers (and the same customer across POS, the online store, and order
 * tracking) type their number in all sorts of equivalent ways — "+266
 * 5041 0310", "266 50410310", "0026650410310", "50410310" — that are all
 * the same Lesotho mobile number but would never match with a plain
 * string/ILIKE comparison. This strips everything down to bare digits and
 * drops the country/international prefix so those variants all collapse to
 * one value, both for storage and for lookups.
 */
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // International dialing prefix, e.g. "0026650410310" -> "26650410310"
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Lesotho country code (+266) followed by more than just the 8-digit
  // local number means it's prefixed — strip it so "+266 50410310" and
  // "50410310" normalize identically.
  if (digits.startsWith('266') && digits.length > 8) {
    digits = digits.slice(3);
  }

  return digits;
}

module.exports = { normalizePhone };
