#!/bin/sh
set -eu

[ "$(id -u)" = 0 ] || { echo 'Firewall setup requires container root.' >&2; exit 1; }
[ "${SCANNER_ISOLATION:-}" = firewall-proxy-v1 ] || { echo 'Explicit isolation configuration is required.' >&2; exit 1; }
[ "${EGRESS_PROXY_IP:-}" = 172.30.44.2 ] || { echo 'Unexpected proxy network address.' >&2; exit 1; }
[ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6)" = 1 ] || { echo 'IPv6 must be disabled.' >&2; exit 1; }
[ "$(cat /proc/sys/net/ipv6/conf/default/disable_ipv6)" = 1 ] || { echo 'IPv6 must be disabled for new interfaces.' >&2; exit 1; }

iptables -w -P OUTPUT DROP
iptables -w -F OUTPUT
iptables -w -A OUTPUT -m conntrack --ctstate ESTABLISHED -j ACCEPT
iptables -w -A OUTPUT -p tcp -d "$EGRESS_PROXY_IP/32" --dport 3128 -m conntrack --ctstate NEW -j ACCEPT
iptables -w -A OUTPUT -j REJECT
# There is intentionally no loopback or DNS exception. Browser IPC uses Unix pipes.
printf '%s\n' firewall-proxy-v1 > /run/viberoast-isolation
chmod 0444 /run/viberoast-isolation

exec setpriv --reuid=1000 --regid=1000 --init-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
  node --import tsx worker/start.ts scanner
