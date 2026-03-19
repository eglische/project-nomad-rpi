FROM debian:trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates welle.io \
  && rm -rf /var/lib/apt/lists/*

COPY run-radio.sh /usr/local/bin/run-radio.sh
RUN chmod +x /usr/local/bin/run-radio.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/run-radio.sh"]
