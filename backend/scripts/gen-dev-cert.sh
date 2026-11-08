#!/bin/sh
# Self-signed certificate for LOCAL DEVELOPMENT ONLY (localhost / 127.0.0.1).
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout certs/dev-key.pem -out certs/dev-cert.pem \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
