#!/bin/bash
# On-link discovery without root and without a 1000-process fan-out:
# one nmap host-discovery pass puts every responder in the kernel ARP cache,
# then we read the cache back as "ip<TAB>MAC".
nmap -sn -n --max-retries 1 --host-timeout 8s ${1:-192.168.68.0/24} >/dev/null 2>&1
arp -an 2>/dev/null | grep -v incomplete \
  | sed -nE 's/^\? \(((192\.168\.(6[89]|7[01]))\.[0-9]+)\) at ([0-9a-f:]+).*/\1\t\4/p' \
  | awk -F'\t' '$2 !~ /ff:ff:ff:ff:ff:ff/ {
      n=split($2,p,":"); for(i=1;i<=n;i++) if(length(p[i])==1) p[i]="0" p[i];
      m=p[1]; for(i=2;i<=n;i++) m=m":"p[i]; print $1"\t"toupper(m) }' \
  | sort -t. -k3,3n -k4,4n -u
