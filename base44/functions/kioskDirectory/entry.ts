// Retired, unused tablet directory mutation endpoint. Card issuing uses nfcCards.
export default async function() {
  return Response.json({ error: 'This directory endpoint is retired' }, { status: 410 });
}
