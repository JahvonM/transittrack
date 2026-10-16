# Optional self-hosted TURN relay

This relay is optional for direct/local connections and generally needed for reliable remote mobile viewing. It is not LiveKit and does not host TransitTrack's database.

Host requirements:
- A maintained Linux server with a stable public IP, an operator-owned DNS name and a trusted TLS certificate for that name.
- Inbound TCP 5349 for TURN over TLS; UDP/TCP 3478 if using STUN or plain TURN; UDP 49160–49260 for relay allocations. Restrictive networks may need a dedicated TCP 443 listener/IP.
- Correct public/private address mapping when the server is behind NAT. Home PCs need port forwarding, a reachable public IP and continuous power/network; carrier NAT can prevent hosting.
- A current supported coturn release from https://github.com/coturn/coturn/releases . Review its sample configuration/options before deploying; this example has not been run on a live host.

Copy turnserver.example.conf to a private deployment directory OUTSIDE this repository. Replace its placeholders with the server's actual values. Generate the TURN shared secret on that server, then store the same secret in the app backend as TT_SUPPORT_TURN_SECRET. Do not place the private config, certificate keys or shared secret in git.

Restrict administrative access, monitor bandwidth, keep coturn updated and test short-lived credentials from both office Wi-Fi and mobile data. Do not enable anonymous/no-auth access. Check that relay attempts toward private/loopback network destinations are rejected.

The supplied quotas are an initial bound for a small fleet, not a capacity promise. Adjust only after observing simultaneous sessions and bandwidth. A deployment should also bound maximum session/connection use at the firewall/provider layer where appropriate.

No server is deployed by these files. Use docs/tablet-remote-support.md for the backend settings and release gates.
